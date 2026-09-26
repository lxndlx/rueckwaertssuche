import { parsePhoneNumber } from 'libphonenumber-js/max';
import { geocoder } from 'libphonenumber-geo-carrier';

const countryNamesDe = new Intl.DisplayNames(['de'], { type: 'region' });
const countryNamesEn = new Intl.DisplayNames(['en'], { type: 'region' });

export async function lookupArea(phone) {
  const parsed = parsePhoneNumber(phone.number);
  if (!parsed || !['FIXED_LINE', 'FIXED_LINE_OR_MOBILE'].includes(parsed.getType())) return null;

  const description = (await geocoder(parsed, 'de'))?.trim();
  if (!description || !parsed.country) return null;
  if ([countryNamesDe.of(parsed.country), countryNamesEn.of(parsed.country)].includes(description)) return null;

  return { name: description };
}
