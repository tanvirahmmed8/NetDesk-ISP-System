param(
 [ValidateSet('customers','review','unidentified','summary')][string]$Section='summary',
 [int]$Offset=0,
 [int]$Limit=100
)
# Read-only preparation: emit JSON/CSV for review. Does not write files or the database.
$ErrorActionPreference='Stop'
function Clean([object]$Value) { return ([string]$Value -replace '\s+',' ').Trim() }
function UniqueValues($Values) { return @($Values | ForEach-Object { Clean $_ } | Where-Object { $_ } | Select-Object -Unique) }
function PhoneCandidates($Rows) {
 $found=@()
 foreach($row in $Rows){
  foreach($match in [regex]::Matches([string]$row.Message,'(?<!\d)(?:\+?880|0)1[3-9](?:[\s-]?\d){8}(?!\d)')){
   $phone=$match.Value -replace '[\s+-]','';if($phone.StartsWith('880')){$phone='0'+$phone.Substring(3)};$found+=$phone
  }
 }
 return @($found | Select-Object -Unique)
}
$paymentLines=Get-Content -LiteralPath 'data/Payment Due list.csv' -Encoding UTF8
$header=0
while($header -lt $paymentLines.Count -and $paymentLines[$header] -notmatch '^,SN,Customer ID,'){$header++}
if($header -eq $paymentLines.Count){throw 'Payment report header not found.'}
$paymentRows=@(($paymentLines[$header..($paymentLines.Count-1)] -join "`n") | ConvertFrom-Csv -WarningAction SilentlyContinue)
$ticketRows=@(Import-Csv -LiteralPath 'data/Ticket list with Our Own Employee Name & Contact number.csv' -Encoding UTF8)
$groups=[ordered]@{}
foreach($row in $paymentRows){
 $cid=(Clean $row.'Customer ID').ToUpperInvariant();if(-not $cid){throw 'Unexpected payment row without CID.'}
 if(-not $groups.Contains($cid)){$groups[$cid]=@{Payments=@();Tickets=@()}}
 $groups[$cid].Payments+=,$row
}
$withoutCid=@()
foreach($row in $ticketRows){
 $cid=(Clean $row.'Customer ID').ToUpperInvariant()
 if(-not $cid){$withoutCid+=,$row;continue}
 if(-not $groups.Contains($cid)){$groups[$cid]=@{Payments=@();Tickets=@()}}
 $groups[$cid].Tickets+=,$row
}
$customers=@();$review=@();$conflicts=0
foreach($cid in $groups.Keys){
 $group=$groups[$cid];$payments=@($group.Payments);$tickets=@($group.Tickets)
 $names=@(UniqueValues @(@($payments|ForEach-Object{$_.Name})+@($tickets|ForEach-Object{$_.'Customer Name'})))
 # Ticket Name/Mobile No. belong to employees/reporters; never use as customer identity.
 $phones=@(UniqueValues @($payments|ForEach-Object{$_.'Mobile No.'}))
 $addresses=@(UniqueValues @($payments|ForEach-Object{$_.Address}))
 $packages=@(UniqueValues @(@($payments|ForEach-Object{$_.Package})+@($tickets|ForEach-Object{$_.Package})))
 $pops=@(UniqueValues @(@($payments|ForEach-Object{$_.POP})+@($tickets|ForEach-Object{$_.'POP Name'})))
 $issues=@('packageId must be mapped after importing packages','accountStatus not confirmed by either report','nextPaymentDate not provided; Entry Date is not a due date')
 if($names.Count -eq 1){$name=$names[0]}else{$name='';$issues+='Customer name missing or conflicting; inspect all source names';if($names.Count -gt 1){$conflicts++}}
 if($phones.Count -eq 1){$phone=$phones[0]}else{$phone='';$issues+='Customer phone missing or conflicting; employee Mobile No. excluded'}
 if($addresses.Count -eq 1){$address=$addresses[0]}else{$address='';if($addresses.Count -gt 1){$issues+='Multiple source addresses; verify the correct address'}}
 if($name.Length -gt 120){$issues+='Source customer name exceeds current API 120-character limit; review without silent truncation'}
 if($packages.Count -gt 1){$issues+='Multiple package names in source reports; select the current package manually'}
 $customers+=[pscustomobject][ordered]@{cid=$cid;name=$name;phone=$phone;email='';address=$address;packageId='';nextPaymentDate='';accountStatus=''}
 $review+=[pscustomobject][ordered]@{
  cid=$cid;customerNames=($names -join ' | ');issues=($issues -join '; ')
  paymentSourceSN=((UniqueValues @($payments|ForEach-Object{$_.SN})) -join ' | ')
  sourceTicketNumbers=((UniqueValues @($tickets|ForEach-Object{$_.'Ticket NO'})) -join ' | ')
  sourcePackageNames=($packages -join ' | ')
  confirmedPaymentReportPhones=($phones -join ' | ')
  unverifiedTicketMessagePhones=((PhoneCandidates $tickets) -join ' | ')
  sourceAddresses=($addresses -join ' | ')
  sourceDistricts=((UniqueValues @($payments|ForEach-Object{$_.District})) -join ' | ')
  sourceUpazilas=((UniqueValues @($payments|ForEach-Object{$_.Upazilla})) -join ' | ')
  sourcePOPs=($pops -join ' | ')
  sourceRegistrationDates=((UniqueValues @($payments|ForEach-Object{$_.'Entry Date'})) -join ' | ')
  sourceMRC=((UniqueValues @($payments|ForEach-Object{$_.MRC})) -join ' | ')
  sourceOTC=((UniqueValues @($payments|ForEach-Object{$_.OTC})) -join ' | ')
  sourcePaymentStatus=((UniqueValues @($payments|ForEach-Object{$_.'Payment Status'})) -join ' | ')
  sourceCustomerTypes=((UniqueValues @($tickets|ForEach-Object{$_.Catagory})) -join ' | ')
 }
}
$unidentified=@($withoutCid|ForEach-Object{[pscustomobject][ordered]@{
 ticketNo=(Clean $_.'Ticket NO');customerName=(Clean $_.'Customer Name');sourcePackageName=(Clean $_.Package);sourcePOP=(Clean $_.'POP Name');unverifiedMessagePhones=((PhoneCandidates @($_)) -join ' | ');issue='Missing Customer ID: retained separately; no invented CID, no employee contact substitution'
}})
$summary=[ordered]@{paymentRows=$paymentRows.Count;ticketRows=$ticketRows.Count;uniqueCustomers=$customers.Count;customersWithPhone=@($customers|Where-Object{$_.phone}).Count;customersWithoutPhone=@($customers|Where-Object{-not $_.phone}).Count;nameConflictCIDs=$conflicts;missingCIDTicketRows=$unidentified.Count;sourcePaymentRowsAccounted=($groups.Values|ForEach-Object{$_.Payments.Count}|Measure-Object -Sum).Sum;sourceTicketRowsAccounted=($groups.Values|ForEach-Object{$_.Tickets.Count}|Measure-Object -Sum).Sum+$unidentified.Count}
if($Section -eq 'summary'){$summary|ConvertTo-Json -Compress;exit}
$rows=switch($Section){'customers'{$customers};'review'{$review};'unidentified'{$unidentified}}
$rows=@($rows)
$csv=@($rows|Select-Object -Skip $Offset -First $Limit|ConvertTo-Csv -NoTypeInformation)
[pscustomobject]@{total=$rows.Count;csv=$csv;summary=$summary}|ConvertTo-Json -Depth 5 -Compress
