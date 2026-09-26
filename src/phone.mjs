import { getCountries, parsePhoneNumberWithError } from 'libphonenumber-js/max';

export class InputError extends Error {}

const countryCodes = new Set(getCountries());
const names = new Intl.DisplayNames(['de'], { type: 'region' });

export const countries = [...countryCodes]
  .map(code => ({ code, name: names.of(code) }))
  .sort((a, b) => a.name.localeCompare(b.name, 'de'));

export function normalizePhone(input, country = 'DE') {
  if (typeof input !== 'string' || input.length > 100 || !input.trim()) {
    throw new InputError('Bitte gib eine vollständige Telefonnummer mit Vorwahl ein.');
  }
  if (typeof country !== 'string' || !countryCodes.has(country)) {
    throw new InputError('Bitte wähle ein gültiges Land aus.');
  }
  // Do not silently extract a number from prose or drop extension digits.
  let value = input.trim();
  if (!/^[+\d\s()./\-]+$/u.test(value)) {
    throw new InputError('Bitte verwende nur Ziffern, Vorwahl und übliche Trennzeichen.');
  }
  value = value.replace(/[\s()./\-]/gu, '');
  if (value.startsWith('00')) value = `+${value.slice(2)}`;
  if (!/^\+?\d+$/.test(value)) {
    throw new InputError('Die internationale Vorwahl beginnt mit + oder 00.');
  }
  let phone;
  try {
    phone = parsePhoneNumberWithError(value, { defaultCountry: country, extract: false });
  } catch {
    throw new InputError('Die Telefonnummer ist unvollständig oder ungültig. Bitte prüfe Vorwahl und Land.');
  }
  if (!phone.isValid()) {
    throw new InputError('Die Telefonnummer ist unvollständig oder ungültig. Bitte prüfe Vorwahl und Land.');
  }
  return {
    number: phone.number,
    formatted: phone.formatInternational(),
    country: phone.country ?? null,
    countryName: phone.country ? names.of(phone.country) : 'International / keinem Land eindeutig zugeordnet',
  };
}

export function matchesPhone(value, expected, country) {
  if (typeof value !== 'string') return false;
  return value.split(';').some(part => {
    const token = part.trim();
    // Never infer the country of a national OSM number from the search input.
    if (!/^(?:\+|00)/.test(token) && !countryCodes.has(country)) return false;
    try {
      return normalizePhone(token, countryCodes.has(country) ? country : 'DE').number === expected;
    } catch {
      return false;
    }
  });
}
