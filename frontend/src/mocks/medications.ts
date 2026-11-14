// Curated demo selections only. No RxNorm normalization or external lookup.
export const medications = [
  { drug: 'ibuprofen', label: 'Ibuprofen' },
  { drug: 'amoxicillin', label: 'Amoxicillin' },
  { drug: 'acetaminophen', label: 'Acetaminophen' },
  { drug: 'warfarin', label: 'Warfarin' },
  { drug: 'sertraline', label: 'Sertraline' },
  { drug: 'clarithromycin', label: 'Clarithromycin' },
  { drug: 'simvastatin', label: 'Simvastatin' },
  { drug: 'tramadol', label: 'Tramadol' },
]
export function searchMedications(query: string) {
  return medications.filter(m => m.label.toLowerCase().includes(query.trim().toLowerCase()))
}
