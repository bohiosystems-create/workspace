// Shared by the browser and the server. Factors are indicative (DEFRA/GHG-Protocol style):
// replace with the factor set your company reports against.
export const AIRPORTS = {
  RUH:["Riyadh King Khalid",24.9576,46.6988],JED:["Jeddah King Abdulaziz",21.6796,39.1565],DMM:["Dammam King Fahd",26.4712,49.7979],MED:["Madinah",24.5534,39.7051],
  DXB:["Dubai",25.2532,55.3657],AUH:["Abu Dhabi",24.433,54.6511],DOH:["Doha Hamad",25.2731,51.6081],BAH:["Bahrain",26.2708,50.6336],KWI:["Kuwait",29.2266,47.9689],MCT:["Muscat",23.5933,58.2844],
  CAI:["Cairo",30.1219,31.4056],AMM:["Amman Queen Alia",31.7226,35.9932],IST:["Istanbul",41.2753,28.7519],
  LHR:["London Heathrow",51.47,-0.4543],CDG:["Paris Charles de Gaulle",49.0097,2.5479],FRA:["Frankfurt",50.0379,8.5622],AMS:["Amsterdam",52.3105,4.7683],MUC:["Munich",48.3538,11.7861],
  MAD:["Madrid",40.4983,-3.5676],BCN:["Barcelona",41.2974,2.0833],FCO:["Rome Fiumicino",41.8003,12.2389],MXP:["Milan Malpensa",45.63,8.7231],ZRH:["Zurich",47.4647,8.5492],
  VIE:["Vienna",48.1103,16.5697],DUB:["Dublin",53.4213,-6.2701],CPH:["Copenhagen",55.618,12.656],ARN:["Stockholm Arlanda",59.6498,17.9238],ATH:["Athens",37.9364,23.9445],LIS:["Lisbon",38.7742,-9.1342],
  JFK:["New York JFK",40.6413,-73.7781],ORD:["Chicago O'Hare",41.9742,-87.9073],ATL:["Atlanta",33.6407,-84.4277],LAX:["Los Angeles",33.9416,-118.4085],SFO:["San Francisco",37.6213,-122.379],IAH:["Houston",29.9902,-95.3368],YYZ:["Toronto Pearson",43.6777,-79.6248],MEX:["Mexico City",19.4363,-99.0721],GRU:["São Paulo Guarulhos",-23.4356,-46.4731],
  DEL:["Delhi",28.5562,77.1],BOM:["Mumbai",19.0896,72.8656],SIN:["Singapore Changi",1.3644,103.9915],KUL:["Kuala Lumpur",2.7456,101.7099],BKK:["Bangkok Suvarnabhumi",13.69,100.7501],HKG:["Hong Kong",22.308,113.9185],PVG:["Shanghai Pudong",31.1443,121.8083],PEK:["Beijing Capital",40.0799,116.5844],
  NRT:["Tokyo Narita",35.772,140.3929],HND:["Tokyo Haneda",35.5494,139.7798],ICN:["Seoul Incheon",37.4602,126.4407],SYD:["Sydney",-33.9399,151.1753],
  JNB:["Johannesburg",-26.1367,28.2411],NBO:["Nairobi",-1.3192,36.9278],LOS:["Lagos",6.5774,3.3212],CMN:["Casablanca",33.3675,-7.5899],
};
export const UPLIFT = 1.08;       // great-circle -> flown distance (DEFRA / GHG Protocol)
export const RF = 1.7;            // radiative forcing multiplier on CO2e
export const SHORT_HAUL_KM = 3700;
// kg CO2e per passenger-km (incl. well-to-tank, excl. radiative forcing)
export const PAX = {
  short: { economy: 0.088, premium: 0.088, business: 0.132, first: 0.132 },
  long:  { economy: 0.080, premium: 0.128, business: 0.232, first: 0.320 },
};
// kg CO2e per tonne-km of air freight
export const FREIGHT = { short: 1.10, long: 0.60 };
export const CO2_PER_CERT = 2.53; // t CO2e avoided per SAF certificate (1 t SAF)

const rad = (d) => (d * Math.PI) / 180;
export function airportKm(a, b) {
  const A = AIRPORTS[a], B = AIRPORTS[b];
  if (!A || !B) return null;
  const dLat = rad(B[1] - A[1]), dLon = rad(B[2] - A[2]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(A[1])) * Math.cos(rad(B[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h)) * UPLIFT;
}
export const haul = (km) => (km <= SHORT_HAUL_KM ? "short" : "long");

// Validates a form body and returns a ledger entry. Throws Error with a user-facing message.
export function buildEntry(b) {
  const kind = b.kind === "freight" ? "freight" : "travel";
  const from = String(b.from || "").toUpperCase().slice(0, 3), to = String(b.to || "").toUpperCase().slice(0, 3);
  let km = Number(b.km) > 0 ? Number(b.km) : airportKm(from, to);
  if (!km) throw new Error("Enter two known airport codes, or a distance in km.");
  const rf = b.rf !== false ? RF : 1;
  const base = { kind, date: b.date || new Date().toISOString().slice(0, 10), from, to, km: Math.round(km), rf: rf > 1 };
  if (kind === "travel") {
    const pax = Math.floor(Number(b.pax));
    if (!(pax >= 1 && pax <= 10000)) throw new Error("Passengers must be 1 or more.");
    const cabin = PAX.short[b.cabin] ? b.cabin : "economy";
    const legs = b.trip === "return" ? 2 : 1;
    const t = (km * legs * pax * PAX[haul(km)][cabin] * rf) / 1000;
    return { ...base, detail: `${pax} pax · ${cabin} · ${legs === 2 ? "return" : "one-way"}`, tco2e: +t.toFixed(3) };
  }
  const kg = Number(b.kg) * (b.unit === "t" ? 1000 : 1);
  if (!(kg > 0)) throw new Error("Enter the cargo weight.");
  const t = (km * (kg / 1000) * FREIGHT[haul(km)] * rf) / 1000;
  return { ...base, detail: `${kg >= 1000 ? +(kg / 1000).toFixed(2) + " t" : Math.round(kg) + " kg"} cargo`, tco2e: +t.toFixed(3) };
}
