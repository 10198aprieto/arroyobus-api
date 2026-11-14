import { expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';

test('static ZIP dates are valid and all files match TXT and JSON mirrors', () => {
  const result = execFileSync('python3', ['-c', `
import csv, datetime, io, json, zipfile
with zipfile.ZipFile('public/gtfs-static.zip') as archive:
    for name in archive.namelist():
        if not name.endswith('.txt'):
            continue
        rows = list(csv.DictReader(io.StringIO(archive.read(name).decode('utf-8-sig'))))
        assert archive.read(name) == open('public/gtfs/' + name, 'rb').read(), name
        assert rows == json.load(open('public/gtfs/' + name.replace('.txt', '.json'))), name
        for row in rows:
            for key, value in row.items():
                if key.endswith('_date') and value:
                    assert len(value) == 8, (name, key, value)
                    datetime.datetime.strptime(value, '%Y%m%d')
    metadata = list(csv.DictReader(io.StringIO(archive.read('feed_info.txt').decode('utf-8-sig'))))
assert metadata == list(csv.DictReader(open('public/gtfs/feed_info.txt', encoding='utf-8-sig')))
assert metadata == json.load(open('public/gtfs/feed_info.json'))
print('valid')
`], { encoding: 'utf8' });
  expect(result.trim()).toBe('valid');
});

test('uploaded feed version and validity are preserved', () => {
  const result = execFileSync('python3', ['-c', `
import json
metadata = json.load(open('public/gtfs/feed_info.json'))[0]
assert metadata['feed_version'] == '22.2.1'
assert metadata['feed_start_date'] == '20261114'
assert metadata['feed_end_date'] == '20261231'
for service in json.load(open('public/gtfs/calendar.json')):
    assert service['start_date'] == '20261114'
    assert service['end_date'] == '20261231'
print('valid')
`], { encoding: 'utf8' });
  expect(result.trim()).toBe('valid');
});