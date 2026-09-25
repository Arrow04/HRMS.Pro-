export type CountryDefaults = {
  timezone: string;
  currency: string;
  financialYear: string;
  dateFormat: string;
};

/**
 * All UN member states + Vatican, Palestine, Kosovo, Taiwan.
 * timezone = primary IANA zone, currency = ISO 4217 code.
 * financialYear / dateFormat are sensible defaults per country.
 */
export const COUNTRY_DEFAULTS: Record<string, CountryDefaults> = {
  Afghanistan: { timezone: 'Asia/Kabul', currency: 'AFN', financialYear: 'April', dateFormat: 'DD/MM/YYYY' },
  Albania: { timezone: 'Europe/Tirane', currency: 'EUR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Algeria: { timezone: 'Africa/Algiers', currency: 'DZD', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Andorra: { timezone: 'Europe/Andorra', currency: 'EUR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Angola: { timezone: 'Africa/Luanda', currency: 'AOA', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  'Antigua and Barbuda': { timezone: 'America/Antigua', currency: 'XCD', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Argentina: { timezone: 'America/Argentina/Buenos_Aires', currency: 'ARS', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Armenia: { timezone: 'Asia/Yerevan', currency: 'AMD', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Australia: { timezone: 'Australia/Sydney', currency: 'AUD', financialYear: 'July', dateFormat: 'DD/MM/YYYY' },
  Austria: { timezone: 'Europe/Vienna', currency: 'EUR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Azerbaijan: { timezone: 'Asia/Baku', currency: 'AZN', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Bahamas: { timezone: 'America/Nassau', currency: 'BSD', financialYear: 'July', dateFormat: 'MM/DD/YYYY' },
  Bahrain: { timezone: 'Asia/Bahrain', currency: 'BHD', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Bangladesh: { timezone: 'Asia/Dhaka', currency: 'BDT', financialYear: 'July', dateFormat: 'DD/MM/YYYY' },
  Barbados: { timezone: 'America/Barbados', currency: 'BBD', financialYear: 'April', dateFormat: 'DD/MM/YYYY' },
  Belarus: { timezone: 'Europe/Minsk', currency: 'BYN', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Belgium: { timezone: 'Europe/Brussels', currency: 'EUR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Belize: { timezone: 'America/Belize', currency: 'BZD', financialYear: 'April', dateFormat: 'DD/MM/YYYY' },
  Benin: { timezone: 'Africa/Porto-Novo', currency: 'XOF', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Bhutan: { timezone: 'Asia/Thimphu', currency: 'BTN', financialYear: 'July', dateFormat: 'DD/MM/YYYY' },
  Bolivia: { timezone: 'America/La_Paz', currency: 'BOB', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  'Bosnia and Herzegovina': { timezone: 'Europe/Sarajevo', currency: 'BAM', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Botswana: { timezone: 'Africa/Gaborone', currency: 'BWP', financialYear: 'April', dateFormat: 'DD/MM/YYYY' },
  Brazil: { timezone: 'America/Sao_Paulo', currency: 'BRL', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Brunei: { timezone: 'Asia/Brunei', currency: 'BND', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Bulgaria: { timezone: 'Europe/Sofia', currency: 'BGN', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  'Burkina Faso': { timezone: 'Africa/Ouagadougou', currency: 'XOF', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Burundi: { timezone: 'Africa/Bujumbura', currency: 'BIF', financialYear: 'July', dateFormat: 'DD/MM/YYYY' },
  'Cabo Verde': { timezone: 'Atlantic/Cape_Verde', currency: 'CVE', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Cambodia: { timezone: 'Asia/Phnom_Penh', currency: 'KHR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Cameroon: { timezone: 'Africa/Douala', currency: 'XAF', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Canada: { timezone: 'America/Toronto', currency: 'CAD', financialYear: 'April', dateFormat: 'YYYY-MM-DD' },
  'Central African Republic': { timezone: 'Africa/Bangui', currency: 'XAF', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Chad: { timezone: 'Africa/Ndjamena', currency: 'XAF', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Chile: { timezone: 'America/Santiago', currency: 'CLP', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  China: { timezone: 'Asia/Shanghai', currency: 'CNY', financialYear: 'January', dateFormat: 'YYYY-MM-DD' },
  Colombia: { timezone: 'America/Bogota', currency: 'COP', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Comoros: { timezone: 'Indian/Comoro', currency: 'KMF', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  'Congo (Brazzaville)': { timezone: 'Africa/Brazzaville', currency: 'XAF', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  'Congo (DRC)': { timezone: 'Africa/Kinshasa', currency: 'CDF', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  'Costa Rica': { timezone: 'America/Costa_Rica', currency: 'CRC', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  "Côte d'Ivoire": { timezone: 'Africa/Abidjan', currency: 'XOF', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Croatia: { timezone: 'Europe/Zagreb', currency: 'EUR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Cuba: { timezone: 'America/Havana', currency: 'CUP', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Cyprus: { timezone: 'Europe/Nicosia', currency: 'EUR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Czechia: { timezone: 'Europe/Prague', currency: 'CZK', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Denmark: { timezone: 'Europe/Copenhagen', currency: 'DKK', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Djibouti: { timezone: 'Africa/Djibouti', currency: 'DJF', financialYear: 'July', dateFormat: 'DD/MM/YYYY' },
  Dominica: { timezone: 'America/Dominica', currency: 'XCD', financialYear: 'July', dateFormat: 'DD/MM/YYYY' },
  'Dominican Republic': { timezone: 'America/Santo_Domingo', currency: 'DOP', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Ecuador: { timezone: 'America/Guayaquil', currency: 'USD', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Egypt: { timezone: 'Africa/Cairo', currency: 'EGP', financialYear: 'July', dateFormat: 'DD/MM/YYYY' },
  'El Salvador': { timezone: 'America/El_Salvador', currency: 'USD', financialYear: 'January', dateFormat: 'MM/DD/YYYY' },
  'Equatorial Guinea': { timezone: 'Africa/Malabo', currency: 'XAF', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Eritrea: { timezone: 'Africa/Asmara', currency: 'ERN', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Estonia: { timezone: 'Europe/Tallinn', currency: 'EUR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Eswatini: { timezone: 'Africa/Mbabane', currency: 'SZL', financialYear: 'April', dateFormat: 'DD/MM/YYYY' },
  Ethiopia: { timezone: 'Africa/Addis_Ababa', currency: 'ETB', financialYear: 'July', dateFormat: 'DD/MM/YYYY' },
  Fiji: { timezone: 'Pacific/Fiji', currency: 'FJD', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Finland: { timezone: 'Europe/Helsinki', currency: 'EUR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  France: { timezone: 'Europe/Paris', currency: 'EUR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Gabon: { timezone: 'Africa/Libreville', currency: 'XAF', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Gambia: { timezone: 'Africa/Banjul', currency: 'GMD', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Georgia: { timezone: 'Asia/Tbilisi', currency: 'GEL', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Germany: { timezone: 'Europe/Berlin', currency: 'EUR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Ghana: { timezone: 'Africa/Accra', currency: 'GHS', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Greece: { timezone: 'Europe/Athens', currency: 'EUR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Grenada: { timezone: 'America/Grenada', currency: 'XCD', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Guatemala: { timezone: 'America/Guatemala', currency: 'GTQ', financialYear: 'January', dateFormat: 'MM/DD/YYYY' },
  Guinea: { timezone: 'Africa/Conakry', currency: 'GNF', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  'Guinea-Bissau': { timezone: 'Africa/Bissau', currency: 'GNF', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Guyana: { timezone: 'America/Guyana', currency: 'GYD', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Haiti: { timezone: 'America/Port-au-Prince', currency: 'HTD', financialYear: 'October', dateFormat: 'DD/MM/YYYY' },
  Honduras: { timezone: 'America/Tegucigalpa', currency: 'HNL', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Hungary: { timezone: 'Europe/Budapest', currency: 'HUF', financialYear: 'January', dateFormat: 'YYYY-MM-DD' },
  Iceland: { timezone: 'Atlantic/Reykjavik', currency: 'ISK', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  India: { timezone: 'Asia/Kolkata', currency: 'INR', financialYear: 'April', dateFormat: 'DD/MM/YYYY' },
  Indonesia: { timezone: 'Asia/Jakarta', currency: 'IDR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Iran: { timezone: 'Asia/Tehran', currency: 'IRR', financialYear: 'April', dateFormat: 'YYYY-MM-DD' },
  Iraq: { timezone: 'Asia/Baghdad', currency: 'IQD', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Ireland: { timezone: 'Europe/Dublin', currency: 'EUR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Israel: { timezone: 'Asia/Jerusalem', currency: 'ILS', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Italy: { timezone: 'Europe/Rome', currency: 'EUR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Jamaica: { timezone: 'America/Jamaica', currency: 'JMD', financialYear: 'April', dateFormat: 'DD/MM/YYYY' },
  Japan: { timezone: 'Asia/Tokyo', currency: 'JPY', financialYear: 'April', dateFormat: 'YYYY-MM-DD' },
  Jordan: { timezone: 'Asia/Amman', currency: 'JOD', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Kazakhstan: { timezone: 'Asia/Almaty', currency: 'KZT', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Kenya: { timezone: 'Africa/Nairobi', currency: 'KES', financialYear: 'July', dateFormat: 'DD/MM/YYYY' },
  Kiribati: { timezone: 'Pacific/Tarawa', currency: 'AUD', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Kosovo: { timezone: 'Europe/Belgrade', currency: 'EUR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Kuwait: { timezone: 'Asia/Kuwait', currency: 'KWD', financialYear: 'July', dateFormat: 'DD/MM/YYYY' },
  Kyrgyzstan: { timezone: 'Asia/Bishkek', currency: 'KGS', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Laos: { timezone: 'Asia/Vientiane', currency: 'LAK', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Latvia: { timezone: 'Europe/Riga', currency: 'EUR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Lebanon: { timezone: 'Asia/Beirut', currency: 'LBP', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Lesotho: { timezone: 'Africa/Maseru', currency: 'LSL', financialYear: 'April', dateFormat: 'DD/MM/YYYY' },
  Liberia: { timezone: 'Africa/Monrovia', currency: 'LRD', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Libya: { timezone: 'Africa/Tripoli', currency: 'LYD', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Liechtenstein: { timezone: 'Europe/Vaduz', currency: 'CHF', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Lithuania: { timezone: 'Europe/Vilnius', currency: 'EUR', financialYear: 'January', dateFormat: 'YYYY-MM-DD' },
  Luxembourg: { timezone: 'Europe/Luxembourg', currency: 'EUR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Madagascar: { timezone: 'Indian/Antananarivo', currency: 'MGA', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Malawi: { timezone: 'Africa/Blantyre', currency: 'MWK', financialYear: 'July', dateFormat: 'DD/MM/YYYY' },
  Malaysia: { timezone: 'Asia/Kuala_Lumpur', currency: 'MYR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Maldives: { timezone: 'Indian/Male', currency: 'MVR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Mali: { timezone: 'Africa/Bamako', currency: 'XOF', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Malta: { timezone: 'Europe/Malta', currency: 'EUR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  'Marshall Islands': { timezone: 'Pacific/Majuro', currency: 'USD', financialYear: 'October', dateFormat: 'MM/DD/YYYY' },
  Mauritania: { timezone: 'Africa/Nouakchott', currency: 'MRU', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Mauritius: { timezone: 'Indian/Mauritius', currency: 'MUR', financialYear: 'July', dateFormat: 'DD/MM/YYYY' },
  Mexico: { timezone: 'America/Mexico_City', currency: 'MXN', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Micronesia: { timezone: 'Pacific/Pohnpei', currency: 'USD', financialYear: 'October', dateFormat: 'MM/DD/YYYY' },
  Moldova: { timezone: 'Europe/Chisinau', currency: 'MDL', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Monaco: { timezone: 'Europe/Monaco', currency: 'EUR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Mongolia: { timezone: 'Asia/Ulaanbaatar', currency: 'MNT', financialYear: 'January', dateFormat: 'YYYY-MM-DD' },
  Montenegro: { timezone: 'Europe/Podgorica', currency: 'EUR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Morocco: { timezone: 'Africa/Casablanca', currency: 'MAD', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Mozambique: { timezone: 'Africa/Maputo', currency: 'MZN', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Myanmar: { timezone: 'Asia/Yangon', currency: 'MMK', financialYear: 'April', dateFormat: 'DD/MM/YYYY' },
  Namibia: { timezone: 'Africa/Windhoek', currency: 'NAD', financialYear: 'April', dateFormat: 'DD/MM/YYYY' },
  Nauru: { timezone: 'Pacific/Nauru', currency: 'AUD', financialYear: 'July', dateFormat: 'DD/MM/YYYY' },
  Nepal: { timezone: 'Asia/Kathmandu', currency: 'NPR', financialYear: 'July', dateFormat: 'YYYY-MM-DD' },
  Netherlands: { timezone: 'Europe/Amsterdam', currency: 'EUR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  'New Zealand': { timezone: 'Pacific/Auckland', currency: 'NZD', financialYear: 'April', dateFormat: 'DD/MM/YYYY' },
  Nicaragua: { timezone: 'America/Managua', currency: 'NIO', financialYear: 'January', dateFormat: 'MM/DD/YYYY' },
  Niger: { timezone: 'Africa/Niamey', currency: 'XOF', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Nigeria: { timezone: 'Africa/Lagos', currency: 'NGN', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  'North Korea': { timezone: 'Asia/Pyongyang', currency: 'KPW', financialYear: 'January', dateFormat: 'YYYY-MM-DD' },
  'North Macedonia': { timezone: 'Europe/Skopje', currency: 'MKD', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Norway: { timezone: 'Europe/Oslo', currency: 'NOK', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Oman: { timezone: 'Asia/Muscat', currency: 'OMR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Pakistan: { timezone: 'Asia/Karachi', currency: 'PKR', financialYear: 'July', dateFormat: 'DD/MM/YYYY' },
  Palau: { timezone: 'Pacific/Palau', currency: 'USD', financialYear: 'October', dateFormat: 'MM/DD/YYYY' },
  Palestine: { timezone: 'Asia/Hebron', currency: 'ILS', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Panama: { timezone: 'America/Panama', currency: 'PAB', financialYear: 'January', dateFormat: 'MM/DD/YYYY' },
  'Papua New Guinea': { timezone: 'Pacific/Port_Moresby', currency: 'PGK', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Paraguay: { timezone: 'America/Asuncion', currency: 'PYG', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Peru: { timezone: 'America/Lima', currency: 'PEN', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Philippines: { timezone: 'Asia/Manila', currency: 'PHP', financialYear: 'January', dateFormat: 'MM/DD/YYYY' },
  Poland: { timezone: 'Europe/Warsaw', currency: 'PLN', financialYear: 'January', dateFormat: 'YYYY-MM-DD' },
  Portugal: { timezone: 'Europe/Lisbon', currency: 'EUR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Qatar: { timezone: 'Asia/Qatar', currency: 'QAR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Romania: { timezone: 'Europe/Bucharest', currency: 'RON', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Russia: { timezone: 'Europe/Moscow', currency: 'RUB', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Rwanda: { timezone: 'Africa/Kigali', currency: 'RWF', financialYear: 'July', dateFormat: 'DD/MM/YYYY' },
  'Saint Kitts and Nevis': { timezone: 'America/St_Kitts', currency: 'XCD', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  'Saint Lucia': { timezone: 'America/St_Lucia', currency: 'XCD', financialYear: 'July', dateFormat: 'DD/MM/YYYY' },
  'Saint Vincent and the Grenadines': { timezone: 'America/St_Vincent', currency: 'XCD', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Samoa: { timezone: 'Pacific/Apia', currency: 'WST', financialYear: 'July', dateFormat: 'DD/MM/YYYY' },
  'San Marino': { timezone: 'Europe/San_Marino', currency: 'EUR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  'Sao Tome and Principe': { timezone: 'Africa/Sao_Tome', currency: 'STN', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  'Saudi Arabia': { timezone: 'Asia/Riyadh', currency: 'SAR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Senegal: { timezone: 'Africa/Dakar', currency: 'XOF', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Serbia: { timezone: 'Europe/Belgrade', currency: 'RSD', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Seychelles: { timezone: 'Indian/Mahe', currency: 'SCR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  'Sierra Leone': { timezone: 'Africa/Freetown', currency: 'SLL', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Singapore: { timezone: 'Asia/Singapore', currency: 'SGD', financialYear: 'April', dateFormat: 'DD/MM/YYYY' },
  Slovakia: { timezone: 'Europe/Bratislava', currency: 'EUR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Slovenia: { timezone: 'Europe/Ljubljana', currency: 'EUR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  'Solomon Islands': { timezone: 'Pacific/Guadalcanal', currency: 'SBD', financialYear: 'July', dateFormat: 'DD/MM/YYYY' },
  Somalia: { timezone: 'Africa/Mogadishu', currency: 'SOS', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  'South Africa': { timezone: 'Africa/Johannesburg', currency: 'ZAR', financialYear: 'April', dateFormat: 'YYYY-MM-DD' },
  'South Korea': { timezone: 'Asia/Seoul', currency: 'KRW', financialYear: 'January', dateFormat: 'YYYY-MM-DD' },
  'South Sudan': { timezone: 'Africa/Juba', currency: 'SSP', financialYear: 'July', dateFormat: 'DD/MM/YYYY' },
  Spain: { timezone: 'Europe/Madrid', currency: 'EUR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  'Sri Lanka': { timezone: 'Asia/Colombo', currency: 'LKR', financialYear: 'January', dateFormat: 'YYYY-MM-DD' },
  Sudan: { timezone: 'Africa/Khartoum', currency: 'SDG', financialYear: 'July', dateFormat: 'DD/MM/YYYY' },
  Suriname: { timezone: 'America/Paramaribo', currency: 'SRD', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Sweden: { timezone: 'Europe/Stockholm', currency: 'SEK', financialYear: 'January', dateFormat: 'YYYY-MM-DD' },
  Switzerland: { timezone: 'Europe/Zurich', currency: 'CHF', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Syria: { timezone: 'Asia/Damascus', currency: 'SYP', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Taiwan: { timezone: 'Asia/Taipei', currency: 'TWD', financialYear: 'January', dateFormat: 'YYYY-MM-DD' },
  Tajikistan: { timezone: 'Asia/Dushanbe', currency: 'TJS', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Tanzania: { timezone: 'Africa/Dar_es_Salaam', currency: 'TZS', financialYear: 'July', dateFormat: 'DD/MM/YYYY' },
  Thailand: { timezone: 'Asia/Bangkok', currency: 'THB', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  'Timor-Leste': { timezone: 'Asia/Dili', currency: 'USD', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Togo: { timezone: 'Africa/Lome', currency: 'XOF', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Tonga: { timezone: 'Pacific/Tongatapu', currency: 'TOP', financialYear: 'July', dateFormat: 'DD/MM/YYYY' },
  'Trinidad and Tobago': { timezone: 'America/Port_of_Spain', currency: 'TTD', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Tunisia: { timezone: 'Africa/Tunis', currency: 'TND', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Turkey: { timezone: 'Europe/Istanbul', currency: 'TRY', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Turkmenistan: { timezone: 'Asia/Ashgabat', currency: 'TMT', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Tuvalu: { timezone: 'Pacific/Funafuti', currency: 'AUD', financialYear: 'July', dateFormat: 'DD/MM/YYYY' },
  Uganda: { timezone: 'Africa/Kampala', currency: 'UGX', financialYear: 'July', dateFormat: 'DD/MM/YYYY' },
  Ukraine: { timezone: 'Europe/Kyiv', currency: 'UAH', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  'United Arab Emirates': { timezone: 'Asia/Dubai', currency: 'AED', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  'United Kingdom': { timezone: 'Europe/London', currency: 'GBP', financialYear: 'April', dateFormat: 'DD/MM/YYYY' },
  'United States': { timezone: 'America/New_York', currency: 'USD', financialYear: 'January', dateFormat: 'MM/DD/YYYY' },
  Uruguay: { timezone: 'America/Montevideo', currency: 'UYU', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Uzbekistan: { timezone: 'Asia/Tashkent', currency: 'UZS', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Vanuatu: { timezone: 'Pacific/Efate', currency: 'VUV', financialYear: 'July', dateFormat: 'DD/MM/YYYY' },
  'Vatican City': { timezone: 'Europe/Vatican', currency: 'EUR', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Venezuela: { timezone: 'America/Caracas', currency: 'VES', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Vietnam: { timezone: 'Asia/Ho_Chi_Minh', currency: 'VND', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
  Yemen: { timezone: 'Asia/Aden', currency: 'YER', financialYear: 'April', dateFormat: 'DD/MM/YYYY' },
  Zambia: { timezone: 'Africa/Lusaka', currency: 'ZMW', financialYear: 'July', dateFormat: 'DD/MM/YYYY' },
  Zimbabwe: { timezone: 'Africa/Harare', currency: 'ZWL', financialYear: 'January', dateFormat: 'DD/MM/YYYY' },
};

export const COUNTRY_NAMES: string[] = Object.keys(COUNTRY_DEFAULTS).sort((a, b) => a.localeCompare(b));

const COUNTRY_ALIASES: Record<string, string> = {
  USA: 'United States',
  US: 'United States',
  'United States of America': 'United States',
  UK: 'United Kingdom',
  'Great Britain': 'United Kingdom',
  UAE: 'United Arab Emirates',
  'Republic of India': 'India',
  'PRC': 'China',
  "Cote d'Ivoire": "Côte d'Ivoire",
};

export const getCountryDefaults = (country: string): CountryDefaults | null => {
  const key = COUNTRY_ALIASES[country] || country;
  return COUNTRY_DEFAULTS[key] || null;
};

/** Unique ISO 4217 currency codes used across all countries, sorted. */
export const CURRENCY_CODES: string[] = Array.from(
  new Set(Object.values(COUNTRY_DEFAULTS).map((c) => c.currency)),
).sort((a, b) => a.localeCompare(b));

/** Currency symbol via Intl (no hardcode). Falls back to the code. */
export const getCurrencySymbol = (code: string): string => {
  try {
    const parts = new Intl.NumberFormat('en', { style: 'currency', currency: code }).formatToParts(1);
    return parts.find((p) => p.type === 'currency')?.value || code;
  } catch {
    return code;
  }
};

/**
 * All IANA timezones for the dropdown.
 * Merges browser Intl list with the country catalog (some ICU builds only
 * ship legacy aliases like Asia/Calcutta and miss Asia/Kolkata / UTC).
 */
export const getTimezoneCodes = (): string[] => {
  const set = new Set<string>();
  set.add('UTC');
  for (const tz of Object.values(COUNTRY_DEFAULTS)) set.add(tz.timezone);
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    const zones = intl.supportedValuesOf?.('timeZone');
    if (zones) for (const z of zones) set.add(z);
  } catch {
    // catalog timezones above are already sufficient
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
};
