param(
 [ValidateSet('tickets','review','followups','summary')][string]$Section='summary',
 [int]$Offset=0,
 [int]$Limit=25
)
# Read-only extraction; emits JSON/CSV without writing files or importing data.
$ErrorActionPreference='Stop'
$sourceName='Ticket list with Our Own Employee Name & Contact number.csv'
$source=@(Import-Csv -LiteralPath ('data/'+$sourceName) -Encoding UTF8)
$paymentLines=Get-Content -LiteralPath 'data/Payment Due list.csv' -Encoding UTF8
$header=0
while($header -lt $paymentLines.Count -and $paymentLines[$header] -notmatch '^,SN,Customer ID,'){$header++}
if($header -eq $paymentLines.Count){throw 'Payment header not found.'}
$payments=@(($paymentLines[$header..($paymentLines.Count-1)] -join "`n")|ConvertFrom-Csv -WarningAction SilentlyContinue)
$prepared=@{};foreach($customer in (Import-Csv -LiteralPath 'data/customers-template.csv' -Encoding UTF8)){$prepared[$customer.cid.Trim().ToUpperInvariant()]=$customer}
$paymentByCid=@{};foreach($payment in $payments){$cid=$payment.'Customer ID'.Trim().ToUpperInvariant();if(-not $paymentByCid.ContainsKey($cid)){$paymentByCid[$cid]=@()};$paymentByCid[$cid]+=,$payment}
$categories=@{'Fiber Issue'='line_issue';'Nms down'='no_internet';'Link Down'='no_internet';'Link Fluctuation'='line_issue';'Bandwidth Slow'='slow_speed';'Billing Issue'='billing';'Device Faulty'='line_issue';'Ping High, Packet Loss & Gamming Issue'='slow_speed';'Upload Speed Issue'='slow_speed'}
$serviceRequests=@('Package Upgrade','Package Downgrade','Client Info Change','Router Configuration','Connection Discontinue Issue','Re-Connect','Logical/Physical Installation')
$tickets=@();$review=@();$seen=@{}
foreach($row in $source){
 $ticketNo=$row.'Ticket NO'.Trim();if(-not $ticketNo -or $seen.ContainsKey($ticketNo)){throw 'Missing or duplicate original ticket number: needs review, no silent merge.'};$seen[$ticketNo]=$true
 $cid=$row.'Customer ID'.Trim().ToUpperInvariant();$matched=$cid -and $prepared.ContainsKey($cid)
 $category='other';if($categories.ContainsKey($row.Subject.Trim())){$category=$categories[$row.Subject.Trim()]}
 $kind='support';if($row.Subject.Trim() -eq 'New Connection Query'){$kind='enquiry'}elseif($row.Subject.Trim() -in $serviceRequests){$kind='service_request'}
 $phone='';if($cid -and $paymentByCid.ContainsKey($cid)){$phones=@($paymentByCid[$cid]|ForEach-Object{$_.'Mobile No.'.Trim()}|Where-Object{$_}|Select-Object -Unique);if($phones.Count -eq 1){$phone=$phones[0]}}
 $reason='';if(-not $cid){$reason='Customer ID missing: map a real customer or explicitly approve an unlinked historical ticket'}elseif(-not $matched){$reason='CID absent from the prepared customer upload: verify against the TARGET database; map or explicitly approve unlinked import if still unmatched'}
 # Preserve all 29 original columns verbatim. Source Mobile No. is not a customer phone.
 $record=[ordered]@{};foreach($property in $row.PSObject.Properties){$record[$property.Name]=[string]$property.Value}
 $record['category']=$category;$record['ticketKind']=$kind;$record['confirmedCustomerPhone']=$phone;$record['preparedCustomerMatch']=[string][bool]$matched;$record['customerReviewReason']=$reason
 $tickets+=[pscustomobject]$record
 if($reason){$review+=[pscustomobject][ordered]@{ticketNo=$ticketNo;sourceCustomerId=$cid;sourceCustomerName=$row.'Customer Name';issue=$reason;issueType=$row.Subject;category=$category;sourcePackage=$row.Package;sourcePOP=$row.'POP Name';originalCreatedAt=$row.'Entry Date Time';originalResolvedAt=$row.'Resolved Date';sourceStatus=$row.Status;allowUnlinked='false'}}
}
$followups=@();$emptyRemarks=0
foreach($row in $payments){
 if(-not $row.Remarks.Trim()){$emptyRemarks++;continue}
 $cid=$row.'Customer ID'.Trim().ToUpperInvariant();$reason='';if(-not $prepared.ContainsKey($cid)){$reason='Customer absent from prepared upload; resolve the customer identity before recording a follow-up'}
 $followups+=[pscustomobject][ordered]@{cid=$cid;note=$row.Remarks;outcome='note';occurredAt='';nextFollowUpAt='';promisedPaymentDate='';sourceReport='Payment Due list.csv';sourceSN=$row.SN;sourceCustomerName=$row.Name;sourceRegistrationDate=$row.'Entry Date';customerReviewReason=$reason}
}
$summary=[ordered]@{tickets=$tickets.Count;originalColumns=@($source[0].PSObject.Properties).Count;ticketOutputColumns=@($tickets[0].PSObject.Properties).Count;reviewTickets=$review.Count;ticketsMatchedToPreparedCustomers=@($tickets|Where-Object preparedCustomerMatch -eq 'True').Count;missingCidTickets=@($source|Where-Object{-not $_.'Customer ID'.Trim()}).Count;paymentFollowups=$followups.Count;paymentRowsWithoutRemarks=$emptyRemarks;followupsMatchedToPreparedCustomers=@($followups|Where-Object{-not $_.customerReviewReason}).Count;paymentRowsAccounted=$followups.Count+$emptyRemarks}
if($Section -eq 'summary'){$summary|ConvertTo-Json -Depth 4 -Compress;exit}
$rows=@(switch($Section){'tickets'{$tickets};'review'{$review};'followups'{$followups}})
[pscustomobject]@{total=$rows.Count;csv=@($rows|Select-Object -Skip $Offset -First $Limit|ConvertTo-Csv -NoTypeInformation);summary=$summary}|ConvertTo-Json -Depth 5 -Compress
