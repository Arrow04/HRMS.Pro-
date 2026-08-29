export const INDIAN_STATE_OPTIONS = [
  { id: 'andhra_pradesh', name: 'Andhra Pradesh' },
  { id: 'arunachal_pradesh', name: 'Arunachal Pradesh' },
  { id: 'assam', name: 'Assam' },
  { id: 'bihar', name: 'Bihar' },
  { id: 'chhattisgarh', name: 'Chhattisgarh' },
  { id: 'delhi', name: 'Delhi' },
  { id: 'goa', name: 'Goa' },
  { id: 'gujarat', name: 'Gujarat' },
  { id: 'haryana', name: 'Haryana' },
  { id: 'himachal_pradesh', name: 'Himachal Pradesh' },
  { id: 'jammu_and_kashmir', name: 'Jammu and Kashmir' },
  { id: 'jharkhand', name: 'Jharkhand' },
  { id: 'karnataka', name: 'Karnataka' },
  { id: 'kerala', name: 'Kerala' },
  { id: 'ladakh', name: 'Ladakh' },
  { id: 'madhya_pradesh', name: 'Madhya Pradesh' },
  { id: 'maharashtra', name: 'Maharashtra' },
  { id: 'manipur', name: 'Manipur' },
  { id: 'meghalaya', name: 'Meghalaya' },
  { id: 'mizoram', name: 'Mizoram' },
  { id: 'nagaland', name: 'Nagaland' },
  { id: 'odisha', name: 'Odisha' },
  { id: 'punjab', name: 'Punjab' },
  { id: 'rajasthan', name: 'Rajasthan' },
  { id: 'sikkim', name: 'Sikkim' },
  { id: 'tamil_nadu', name: 'Tamil Nadu' },
  { id: 'telangana', name: 'Telangana' },
  { id: 'tripura', name: 'Tripura' },
  { id: 'uttar_pradesh', name: 'Uttar Pradesh' },
  { id: 'uttarakhand', name: 'Uttarakhand' },
  { id: 'west_bengal', name: 'West Bengal' },
  { id: 'chandigarh', name: 'Chandigarh' },
  { id: 'puducherry', name: 'Puducherry' },
  { id: 'other', name: 'Other' },
];

export function formatIndianState(value?: string | null): string {
  if (!value) return '';
  const match = INDIAN_STATE_OPTIONS.find((s) => s.id === value);
  if (match) return match.name;
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
