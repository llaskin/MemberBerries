const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatDate(dateStr: string): string {
  if (!dateStr || dateStr === 'genesis' || dateStr === 'never') return dateStr
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  const day = parseInt(parts[2], 10)
  const month = MONTHS[parseInt(parts[1], 10) - 1] || parts[1]
  return `${day} ${month} ${parts[0]}`
}

export function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning.'
  if (hour < 17) return 'Good afternoon.'
  return 'Good evening.'
}
