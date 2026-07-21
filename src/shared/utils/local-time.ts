export function formatLocalLogTimestamp(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date);

  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get('year') ?? '0000';
  const month = values.get('month') ?? '00';
  const day = values.get('day') ?? '00';
  const hour = values.get('hour') ?? '00';
  const minute = values.get('minute') ?? '00';
  const second = values.get('second') ?? '00';

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}
