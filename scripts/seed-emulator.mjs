// Writes the organiser code into the local emulator only (the address is fixed to this computer).
const CODE = 'emulator-only-organiser-code';
const url = 'http://127.0.0.1:8080/v1/projects/demo-nf/databases/(default)/documents/config/owner';

const response = await fetch(url, {
  method: 'PATCH',
  headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
  body: JSON.stringify({ fields: { code: { stringValue: CODE } } }),
});
if (!response.ok) {
  console.error(`Could not seed the emulator (${response.status}).`);
  process.exit(1);
}
console.log(`\nLocal emulator only. Organiser code: ${CODE}\nCreate an entrance at the address the dev server prints, plus #/new\n`);
