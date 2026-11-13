import { expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';

test('static ZIP dates are valid and feed metadata matches TXT and JSON mirrors', () => {
  const result = execFileSync('python3', ['-c', `
import csv, datetime, io, json, zipfile
with zipfile.ZipFile('public/gtfs-static.zip') as archive:
    for name in archive.namelist():
        if not name.endswith('.txt'):
            continue
        rows = list(csv.DictReader(io.StringIO(archive.read(name).decode('utf-8-sig'))))
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