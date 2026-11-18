type CalendarEvent = {title: string; venue: string; starts_at: string};

function calendarText(value: string) {
 return value.replaceAll('\\', '\\\\').replace(/\r\n|\r|\n/g, '\\n')
  .replaceAll(',', '\\,').replaceAll(';', '\\;');
}

function calendarTimestamp(value: string | number) {
 return new Date(value).toISOString().replace(/[-:]|\.\d{3}/g, '');
}

function foldLine(line: string) {
 const encoder = new TextEncoder();
 let result = '';
 let bytes = 0;
 for (const character of line) {
  const width = encoder.encode(character).length;
  if (bytes + width > 75) {
   result += '\r\n ';
   bytes = 1;
  }
  result += character;
  bytes += width;
 }
 return result;
}

export function downloadEventCalendar(event: CalendarEvent, eventUrl: URL) {
 const lines = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Tired Events//Shared Events//EN',
  'BEGIN:VEVENT',
  'UID:' + eventUrl.href,
  'DTSTAMP:' + calendarTimestamp(Date.now()),
  'DTSTART:' + calendarTimestamp(event.starts_at),
  'SUMMARY:' + calendarText(event.title),
  'LOCATION:' + calendarText(event.venue),
  'URL:' + eventUrl.href,
  'END:VEVENT',
  'END:VCALENDAR'
 ];
 const file = new Blob([lines.map(foldLine).join('\r\n') + '\r\n'], {type:'text/calendar;charset=utf-8'});
 const objectUrl = URL.createObjectURL(file);
 const link = document.createElement('a');
 link.href = objectUrl;
 link.download = 'tired-event.ics';
 try { link.click(); }
 finally { setTimeout(() => URL.revokeObjectURL(objectUrl), 1000); }
}
