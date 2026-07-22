const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000

const localCalendarDay = (date: Date): number =>
  Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())

export const formatCommentTimestamp = (
  createdAt: number,
  locale: string,
  now = Date.now()
): string => {
  const createdDate = new Date(createdAt)
  const currentDate = new Date(now)
  if (Number.isNaN(createdDate.getTime())) return ''

  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(createdDate)
  const dayDifference = Math.round(
    (localCalendarDay(createdDate) - localCalendarDay(currentDate)) / DAY_IN_MILLISECONDS
  )

  if (dayDifference === 0 || dayDifference === -1) {
    const relativeDay = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
      .format(dayDifference, 'day')
    return `${relativeDay} ${time}`
  }

  const date = new Intl.DateTimeFormat(locale, {
    ...(createdDate.getFullYear() === currentDate.getFullYear()
      ? {}
      : { year: 'numeric' as const }),
    month: 'short',
    day: 'numeric'
  }).format(createdDate)
  return `${date} ${time}`
}
