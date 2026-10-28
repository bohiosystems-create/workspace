// The day's operating picture for three demo facilities — a combined-cycle power station, a seawater reverse-osmosis
// desalination plant and an airport terminal. Everything is generated for the calendar date given (deterministic for
// that day), so the demo always looks current: maintenance falls due, readings drift, alarms come and go. People's
// and the orchestrator's changes are events applied on top (engine.ts). All names are fictional.
import { rng } from "../data/util";
import { addGasWork } from "./gasplant";
import { addAirportWork } from "./airport";
import type { Alarm, Asset, AssetStatus, Criticality, Facility, FmData, Priority, Reading, Sector, Technician, Trade, WorkOrder, WoStatus, WoType } from "./types";

const addDays = (iso: string, n: number) => { const d = new Date(iso.slice(0, 10) + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const atTime = (iso: string, h: number, m = 0) => `${iso.slice(0, 10)}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`;
const dayNo = (iso: string) => Math.floor(Date.parse(iso.slice(0, 10) + "T00:00:00Z") / 86400000);
const r1 = (x: number) => Math.round(x * 10) / 10;

// ------------------------------------------------------------------ reading profiles by asset class
type Prof = [key: string, name: string, unit: string, base: number, spread: number, low?: number, high?: number];
const PROFILES: Record<string, Prof[]> = {
  pump: [["vib", "Vibration", "mm/s", 2.6, 0.6, undefined, 7.1], ["brg", "Bearing temperature", "°C", 62, 4, undefined, 85], ["flow", "Flow", "m³/h", 2400, 120, 1800], ["amps", "Motor current", "A", 182, 8, undefined, 230]],
  hpump: [["vib", "Vibration", "mm/s", 3.1, 0.5, undefined, 7.1], ["brg", "Bearing temperature", "°C", 68, 4, undefined, 90], ["dp", "Discharge pressure", "bar", 66, 1.5, 58, 72], ["amps", "Motor current", "A", 410, 15, undefined, 480]],
  gt: [["mw", "Load", "MW", 285, 8, undefined, 310], ["exh", "Exhaust temperature spread", "°C", 18, 4, undefined, 35], ["vib", "Bearing vibration", "mm/s", 4.2, 0.6, undefined, 9.5], ["ce", "Compressor efficiency", "%", 88, 0.8, 84]],
  st: [["mw", "Load", "MW", 390, 10, undefined, 420], ["vib", "Shaft vibration", "µm", 48, 6, undefined, 110], ["vac", "Condenser vacuum", "mbar a", 78, 4, undefined, 110], ["ste", "Main steam temperature", "°C", 565, 3, 540, 575]],
  hrsg: [["drum", "HP drum level", "mm", 0, 25, -150, 150], ["stack", "Stack temperature", "°C", 92, 4, undefined, 120], ["att", "Attemperator flow", "t/h", 11, 2, undefined, 25]],
  transformer: [["oil", "Top-oil temperature", "°C", 61, 4, undefined, 95], ["wdg", "Winding temperature", "°C", 74, 5, undefined, 110], ["load", "Load", "%", 68, 8, undefined, 100], ["h2", "Dissolved hydrogen (DGA)", "ppm", 42, 8, undefined, 150]],
  breaker: [["ops", "Operations since service", "ops", 1240, 30, undefined, 2000], ["sf6", "SF₆ pressure", "bar", 6.2, 0.05, 5.8]],
  ro: [["fp", "Feed pressure", "bar", 64, 1.2, undefined, 70], ["dp", "Differential pressure", "bar", 1.9, 0.2, undefined, 3.5], ["cond", "Permeate conductivity", "µS/cm", 320, 25, undefined, 500], ["rec", "Recovery", "%", 44, 0.8, 40]],
  uf: [["tmp", "Trans-membrane pressure", "bar", 0.55, 0.06, undefined, 1.2], ["turb", "Filtrate turbidity", "NTU", 0.04, 0.01, undefined, 0.1], ["flux", "Flux", "LMH", 62, 3, 45]],
  erd: [["eff", "Transfer efficiency", "%", 95.5, 0.5, 92], ["mix", "Volumetric mixing", "%", 4.8, 0.6, undefined, 8], ["vib", "Vibration", "mm/s", 1.6, 0.3, undefined, 4.5]],
  dosing: [["rate", "Dose rate", "mg/l", 2.1, 0.2, 1.5, 3.5], ["level", "Day-tank level", "%", 62, 12, 15]],
  screen: [["dpw", "Screen differential", "mm", 85, 15, undefined, 250], ["run", "Run hours today", "h", 18, 3]],
  chiller: [["chws", "Chilled-water supply", "°C", 6.8, 0.3, undefined, 8.5], ["kwtr", "Efficiency", "kW/TR", 0.62, 0.03, undefined, 0.8], ["appr", "Condenser approach", "°C", 2.4, 0.4, undefined, 4.5]],
  ahu: [["sat", "Supply-air temperature", "°C", 14.5, 0.6, undefined, 17], ["dpf", "Filter differential", "Pa", 180, 30, undefined, 350]],
  escalator: [["trips", "Trips (24 h)", "", 0, 0.6, undefined, 3], ["hrs", "Run hours (24 h)", "h", 19, 1.5], ["brk", "Brake temperature", "°C", 48, 4, undefined, 75]],
  lift: [["door", "Door faults (24 h)", "", 1, 1, undefined, 6], ["trips", "Trips (24 h)", "", 0, 0.5, undefined, 3], ["lev", "Levelling error", "mm", 4, 1.2, undefined, 10]],
  pbb: [["avail", "Availability (24 h)", "%", 98, 1.2, 92], ["faults", "Drive faults (24 h)", "", 0, 0.7, undefined, 3], ["pca", "PCA supply temperature", "°C", 13, 0.8, undefined, 16]],
  bhs: [["thru", "Throughput", "bags/h", 2900, 160], ["jams", "Jams (24 h)", "", 4, 2, undefined, 12], ["mtr", "Motor temperature", "°C", 58, 4, undefined, 80]],
  eds: [["thru", "Throughput", "bags/h", 640, 40], ["rej", "Rejection rate", "%", 3.1, 0.6, undefined, 6]],
  ups: [["load", "Load", "%", 54, 6, undefined, 85], ["batt", "Battery autonomy", "min", 14, 1.5, 10]],
  genset: [["fuel", "Fuel level", "%", 86, 6, 40], ["batt", "Starter battery", "V", 26.8, 0.3, 24]],
  ccr: [["ir", "Circuit insulation", "MΩ", 28, 6, 10], ["lamps", "Runway edge lamps out", "of 240", 11.5, 0.2, undefined, 12]],
  firepump: [["press", "Jockey pressure", "bar", 9.2, 0.3, 8], ["start", "Weekly churn test", "pass", 1, 0]],
  compressor: [["press", "Discharge pressure", "bar", 7.4, 0.2, 6.5, 8.5], ["temp", "Discharge temperature", "°C", 88, 5, undefined, 110]],
  // oil & gas
  separator: [["lvl", "Liquid level", "%", 48, 6, 20, 80], ["press", "Pressure", "barg", 68, 1.2, undefined, 75], ["h2s", "H₂S in inlet gas", "%", 2.1, 0.1]],
  gascomp: [["vib", "Vibration", "mm/s", 3.2, 0.5, undefined, 7.1], ["dt", "Discharge temperature", "°C", 128, 4, undefined, 150], ["sgas", "Seal-gas leakage", "Nm³/h", 4, 0.8, undefined, 9], ["pr", "Pressure ratio", "", 2.4, 0.05]],
  amine: [["h2s", "H₂S in treated gas", "ppm", 2.1, 0.4, undefined, 4], ["load", "Rich amine loading", "mol/mol", 0.42, 0.02, undefined, 0.5]],
  teg: [["dew", "Water dew point", "°C", -12, 1, undefined, -5], ["teg", "TEG purity", "%", 99.2, 0.1, 98.5]],
  expander: [["spd", "Speed", "rpm", 18500, 300, undefined, 21000], ["vib", "Shaft vibration", "µm", 22, 3, undefined, 50]],
  flare: [["pilot", "Pilots lit", "of 4", 4, 0, 3.5], ["flow", "Flare flow", "t/h", 2.1, 0.6, undefined, 8]],
  tank: [["lvl", "Level", "%", 61, 8, undefined, 90], ["wall", "Minimum wall thickness", "mm", 9.2, 0.1, 8]],
  pipeline: [["press", "Pressure", "barg", 82, 1, undefined, 90], ["cp", "Cathodic-protection potential", "mV", -980, 15, undefined, -850], ["span", "Longest free span (subsea section)", "m", 11.3, 0.15, undefined, 12]],
  detector: [["lel", "Flammable gas", "% LEL", 1, 0.8, undefined, 20], ["h2s", "H₂S", "ppm", 0.4, 0.3, undefined, 10]],
};
// The worst of the out-of-range readings decides how badly an asset is doing: which reading drifts on a degraded asset.
const DRIFT: Record<string, string> = { pump: "vib", hpump: "brg", gt: "exh", st: "vib", hrsg: "stack", transformer: "h2", breaker: "sf6", ro: "dp", uf: "tmp", erd: "mix", dosing: "rate", screen: "dpw", chiller: "kwtr", ahu: "dpf", escalator: "trips", lift: "door", pbb: "faults", bhs: "jams", eds: "rej", ups: "batt", genset: "batt", ccr: "lamps", firepump: "press", compressor: "temp",
  separator: "press", gascomp: "sgas", amine: "h2s", teg: "dew", expander: "vib", flare: "pilot", tank: "wall", pipeline: "cp", detector: "lel" };

// ------------------------------------------------------------------ the three facilities
type A = [tag: string, name: string, cls: string, trade: Trade, crit: Criticality, zone: string, mfr: string, pmDays: number, spares?: string[]];
interface Plant {
  f: Omit<Facility, "output" | "efficiency"> & { output: { name: string; unit: string; target: number }; efficiency: Omit<Facility["efficiency"], "value"> & { base: number } };
  systems: [code: string, name: string, assets: A[]][];
  techs: [name: string, role: string, trades: Trade[], shift: Technician["shift"], zone: string, years: number][];
  spares: [part: string, stock: number, min: number, lead: number, cost: number, loc: string][];
  /** today's story: assets in trouble [tag, status, alarm severity, alarm message] */
  story: [tag: string, status: AssetStatus, sev: Alarm["severity"] | null, msg: string][];
}

const ENERGY: Plant = {
  f: { id: "kcps", name: "Kinan Coastal Power Station", sector: "energy", location: "Red Sea coast (demo)", operator: "Kinan Energy Operations", capacity: "1,250 MW combined cycle · 380 kV substation",
    description: "Two gas turbines and two heat-recovery steam generators feeding one steam turbine, seawater once-through cooling and a 380 kV switchyard.",
    output: { name: "Net output", unit: "MW", target: 1180 }, efficiency: { name: "Net heat rate", unit: "kJ/kWh", target: 6250, base: 6290, lowerIsBetter: true } },
  systems: [
    ["GT1", "Gas turbine 1", [["GT-11", "Gas turbine 1", "gt", "mechanical", "A", "Turbine hall", "Siemens-type (demo)", 90, ["GT combustor liner kit", "GT inlet filter set"]], ["GT-11-LO", "GT1 lube-oil pump A", "pump", "mechanical", "A", "Turbine hall", "Flowserve-type", 60, ["Mechanical seal 80 mm"]], ["GT-11-LOB", "GT1 lube-oil pump B (standby)", "pump", "mechanical", "A", "Turbine hall", "Flowserve-type", 60, ["Mechanical seal 80 mm"]]]],
    ["GT2", "Gas turbine 2", [["GT-12", "Gas turbine 2", "gt", "mechanical", "A", "Turbine hall", "Siemens-type (demo)", 90, ["GT combustor liner kit", "GT inlet filter set"]], ["GT-12-LO", "GT2 lube-oil pump A", "pump", "mechanical", "A", "Turbine hall", "Flowserve-type", 60, ["Mechanical seal 80 mm"]]]],
    ["HRSG", "Heat-recovery steam generators", [["HRSG-1", "HRSG 1", "hrsg", "mechanical", "A", "HRSG area", "NEM-type (demo)", 120], ["HRSG-2", "HRSG 2", "hrsg", "mechanical", "A", "HRSG area", "NEM-type (demo)", 120], ["BFP-1A", "Boiler feed pump 1A", "hpump", "mechanical", "A", "HRSG area", "KSB-type", 45, ["BFP cartridge seal"]], ["BFP-1B", "Boiler feed pump 1B (standby)", "hpump", "mechanical", "A", "HRSG area", "KSB-type", 45, ["BFP cartridge seal"]]]],
    ["ST", "Steam turbine", [["ST-10", "Steam turbine", "st", "mechanical", "A", "Turbine hall", "GE-type (demo)", 120], ["CEP-1", "Condensate extraction pump 1", "pump", "mechanical", "B", "Turbine hall", "Sulzer-type", 60, ["Mechanical seal 80 mm"]]]],
    ["CW", "Seawater cooling", [["CWP-1", "Cooling-water pump 1", "pump", "mechanical", "A", "Intake", "Torishima-type", 60, ["CW pump bearing set"]], ["CWP-2", "Cooling-water pump 2", "pump", "mechanical", "A", "Intake", "Torishima-type", 60, ["CW pump bearing set"]], ["CWP-3", "Cooling-water pump 3 (standby)", "pump", "mechanical", "A", "Intake", "Torishima-type", 60, ["CW pump bearing set"]], ["TS-1", "Travelling screen 1", "screen", "mechanical", "B", "Intake", "Passavant-type", 30]]],
    ["SUB", "380 kV substation", [["GSU-1", "Generator step-up transformer 1", "transformer", "electrical", "A", "Switchyard", "ABB-type", 180, ["Transformer bushing 420 kV"]], ["GSU-2", "Generator step-up transformer 2", "transformer", "electrical", "A", "Switchyard", "ABB-type", 180], ["GSU-3", "Generator step-up transformer 3", "transformer", "electrical", "A", "Switchyard", "ABB-type", 180], ["CB-380-01", "380 kV breaker bay 1", "breaker", "electrical", "A", "Switchyard", "Siemens-type", 365, ["SF₆ gas cylinder"]], ["CB-380-02", "380 kV breaker bay 2", "breaker", "electrical", "A", "Switchyard", "Siemens-type", 365, ["SF₆ gas cylinder"]]]],
    ["BOP", "Balance of plant", [["AC-1", "Instrument-air compressor 1", "compressor", "mechanical", "B", "BOP building", "Atlas-type", 30, ["Compressor service kit"]], ["AC-2", "Instrument-air compressor 2", "compressor", "mechanical", "B", "BOP building", "Atlas-type", 30, ["Compressor service kit"]], ["UPS-DCS", "DCS UPS", "ups", "electrical", "A", "Control building", "Eaton-type", 90], ["EDG-1", "Emergency diesel generator", "genset", "electrical", "A", "BOP building", "Caterpillar-type", 30]]],
  ],
  techs: [["Faisal Al-Otaibi", "Shift supervisor", ["mechanical", "electrical"], "day", "Control building", 14], ["Ravi Krishnan", "Mechanical technician", ["mechanical"], "day", "Turbine hall", 9], ["Omar Al-Shehri", "Mechanical technician", ["mechanical"], "day", "Intake", 4], ["Salman Al-Ghamdi", "Electrical technician", ["electrical"], "day", "Switchyard", 11], ["Joseph Mensah", "I&C technician", ["instrumentation", "controls"], "day", "Control building", 7], ["Abdullah Al-Harbi", "Mechanical technician", ["mechanical"], "night", "HRSG area", 6], ["Pradeep Nair", "Electrical technician", ["electrical"], "night", "Switchyard", 12], ["Nasser Al-Qahtani", "Chemist", ["chemical"], "day", "BOP building", 8], ["Mohammed Siddiqui", "Mechanical technician", ["mechanical"], "off", "Turbine hall", 5]],
  spares: [["Mechanical seal 80 mm", 2, 2, 21, 9800, "Main store A-12"], ["CW pump bearing set", 0, 1, 45, 38000, "Main store B-03"], ["BFP cartridge seal", 1, 1, 30, 42000, "Main store A-14"], ["GT inlet filter set", 18, 24, 14, 1650, "Filter store"], ["GT combustor liner kit", 1, 1, 120, 640000, "Strategic store"], ["Transformer bushing 420 kV", 1, 1, 180, 210000, "Strategic store"], ["SF₆ gas cylinder", 4, 3, 10, 5200, "Gas store"], ["Compressor service kit", 1, 2, 7, 3400, "Main store C-01"]],
  story: [["CWP-2", "degraded", "high", "Cooling-water pump 2 vibration 7.8 mm/s, above the 7.1 alarm"], ["GT-12", "running", "medium", "GT2 exhaust temperature spread 31 °C, rising for 4 days"], ["AC-1", "down", "high", "Instrument-air compressor 1 tripped on high discharge temperature"], ["GSU-2", "running", "low", "GSU-2 dissolved hydrogen 96 ppm, trending up"]],
};

const WATER: Plant = {
  f: { id: "krsd", name: "Kinan Red Sea Desalination Plant", sector: "water", location: "Red Sea coast (demo)", operator: "Kinan Water Operations", capacity: "400,000 m³/day SWRO · 8 trains",
    description: "Open seawater intake, dissolved-air flotation and ultrafiltration pretreatment, eight reverse-osmosis trains with pressure-exchanger energy recovery, remineralisation and a 33 kV supply.",
    output: { name: "Product water", unit: "m³/day", target: 400000 }, efficiency: { name: "Specific energy", unit: "kWh/m³", target: 3.2, base: 3.27, lowerIsBetter: true } },
  systems: [
    ["INT", "Seawater intake", [["SWP-101", "Seawater intake pump 1", "pump", "mechanical", "A", "Intake", "Flowserve-type", 60, ["Intake pump bearing set"]], ["SWP-102", "Seawater intake pump 2", "pump", "mechanical", "A", "Intake", "Flowserve-type", 60, ["Intake pump bearing set"]], ["SWP-103", "Seawater intake pump 3", "pump", "mechanical", "A", "Intake", "Flowserve-type", 60, ["Intake pump bearing set"]], ["SWP-104", "Seawater intake pump 4 (standby)", "pump", "mechanical", "A", "Intake", "Flowserve-type", 60, ["Intake pump bearing set"]], ["TS-101", "Drum screen 1", "screen", "mechanical", "B", "Intake", "Hydro-type", 30], ["TS-102", "Drum screen 2", "screen", "mechanical", "B", "Intake", "Hydro-type", 30]]],
    ["PRE", "Pretreatment", [["UF-01", "Ultrafiltration skid 1", "uf", "mechanical", "A", "Pretreatment", "DuPont-type", 30, ["UF module"]], ["UF-02", "Ultrafiltration skid 2", "uf", "mechanical", "A", "Pretreatment", "DuPont-type", 30, ["UF module"]], ["UF-03", "Ultrafiltration skid 3", "uf", "mechanical", "A", "Pretreatment", "DuPont-type", 30, ["UF module"]], ["UF-04", "Ultrafiltration skid 4", "uf", "mechanical", "A", "Pretreatment", "DuPont-type", 30, ["UF module"]], ["CD-FC", "Ferric chloride dosing", "dosing", "chemical", "B", "Chemical building", "ProMinent-type", 30, ["Dosing pump diaphragm"]], ["CD-SBS", "Sodium bisulphite dosing", "dosing", "chemical", "A", "Chemical building", "ProMinent-type", 30, ["Dosing pump diaphragm"]]]],
    ["RO", "Reverse-osmosis trains", Array.from({ length: 8 }, (_, i) => [[`RO-0${i + 1}`, `RO train ${i + 1}`, "ro", "mechanical", "A", "RO hall", "Toray-type membranes", 30, ["RO membrane element", "RO cartridge filter set"]], [`HPP-0${i + 1}`, `High-pressure pump ${i + 1}`, "hpump", "mechanical", "A", "RO hall", "Andritz-type", 45, ["HP pump mechanical seal"]], [`ERD-0${i + 1}`, `Energy recovery bank ${i + 1}`, "erd", "mechanical", "A", "RO hall", "PX-type", 90, ["ERD rotor cartridge"]]] as A[]).flat()],
    ["POST", "Post-treatment", [["LS-1", "Lime saturator 1", "dosing", "chemical", "B", "Post-treatment", "Demo", 30], ["CO2-1", "CO₂ dosing", "dosing", "chemical", "B", "Post-treatment", "Demo", 30], ["CL-1", "Chlorination", "dosing", "chemical", "A", "Post-treatment", "Demo", 30, ["Dosing pump diaphragm"]]]],
    ["PWS", "Product water pumping", [["PWP-1", "Product water pump 1", "pump", "mechanical", "A", "Product pump station", "KSB-type", 60, ["Mechanical seal 100 mm"]], ["PWP-2", "Product water pump 2", "pump", "mechanical", "A", "Product pump station", "KSB-type", 60, ["Mechanical seal 100 mm"]], ["PWP-3", "Product water pump 3 (standby)", "pump", "mechanical", "A", "Product pump station", "KSB-type", 60, ["Mechanical seal 100 mm"]]]],
    ["ELEC", "33 kV electrical", [["TX-33-1", "33/6.6 kV transformer 1", "transformer", "electrical", "A", "Substation", "Siemens-type", 180], ["TX-33-2", "33/6.6 kV transformer 2", "transformer", "electrical", "A", "Substation", "Siemens-type", 180], ["UPS-SCADA", "SCADA UPS", "ups", "electrical", "A", "Control building", "Eaton-type", 90], ["EDG-W1", "Emergency generator", "genset", "electrical", "A", "Substation", "Cummins-type", 30]]],
  ],
  techs: [["Hassan Al-Zahrani", "Shift supervisor", ["mechanical", "chemical"], "day", "Control building", 16], ["Ahmed Bakr", "Mechanical technician", ["mechanical"], "day", "RO hall", 8], ["Sunil Varghese", "Mechanical technician", ["mechanical"], "day", "Intake", 10], ["Yousef Al-Malki", "Electrical technician", ["electrical"], "day", "Substation", 6], ["Grace Okoro", "Process chemist", ["chemical"], "day", "Chemical building", 9], ["Khalid Al-Dossary", "I&C technician", ["instrumentation", "controls"], "day", "Control building", 7], ["Imran Qureshi", "Mechanical technician", ["mechanical"], "night", "RO hall", 5], ["Fahad Al-Subaie", "Electrical technician", ["electrical"], "night", "Substation", 4], ["Marco Ruiz", "Mechanical technician", ["mechanical"], "off", "Pretreatment", 12]],
  spares: [["RO membrane element", 48, 40, 60, 2900, "Membrane store"], ["RO cartridge filter set", 6, 8, 14, 4200, "Main store R-02"], ["HP pump mechanical seal", 1, 2, 35, 26000, "Main store R-05"], ["ERD rotor cartridge", 2, 2, 90, 68000, "Strategic store"], ["UF module", 12, 10, 45, 7800, "Membrane store"], ["Intake pump bearing set", 1, 1, 40, 31000, "Main store I-01"], ["Dosing pump diaphragm", 3, 4, 10, 650, "Chemical store"], ["Mechanical seal 100 mm", 2, 2, 28, 11500, "Main store P-02"]],
  story: [["RO-05", "degraded", "high", "RO train 5 differential pressure 3.7 bar: fouling, clean-in-place due"], ["HPP-03", "running", "medium", "HP pump 3 bearing temperature 86 °C, rising"], ["SWP-102", "down", "critical", "Seawater intake pump 2 tripped: motor overcurrent"], ["CD-SBS", "running", "medium", "Sodium bisulphite day tank at 18 %"]],
};

const AIRPORT: Plant = {
  f: { id: "kgia", name: "Kinan Gulf International Airport — Terminal 2", sector: "airport", location: "Eastern Province (demo)", operator: "Kinan Airport Operations", capacity: "28 M passengers/year · 16 contact stands",
    description: "Departures and arrivals terminal with a 6 km baggage system, sixteen boarding bridges, 60 escalators and lifts, a 12,000 TR chiller plant and airfield ground lighting.",
    output: { name: "Passengers", unit: "pax/day", target: 82000 }, efficiency: { name: "On-time departures", unit: "%", target: 85, base: 86.5, lowerIsBetter: false } },
  systems: [
    ["BHS", "Baggage handling", [["BHS-SRT-1", "Tilt-tray sorter 1", "bhs", "mechanical", "A", "Baggage hall", "Vanderlande-type", 30, ["Sorter tray", "Conveyor drive motor 4 kW"]], ["BHS-SRT-2", "Tilt-tray sorter 2", "bhs", "mechanical", "A", "Baggage hall", "Vanderlande-type", 30, ["Sorter tray", "Conveyor drive motor 4 kW"]], ["EDS-01", "Hold-baggage screening 1", "eds", "electrical", "A", "Baggage hall", "Smiths-type", 30], ["EDS-02", "Hold-baggage screening 2", "eds", "electrical", "A", "Baggage hall", "Smiths-type", 30], ["CAR-A3", "Reclaim carousel A3", "bhs", "mechanical", "B", "Arrivals", "Vanderlande-type", 30, ["Conveyor drive motor 4 kW"]], ["CAR-A4", "Reclaim carousel A4", "bhs", "mechanical", "B", "Arrivals", "Vanderlande-type", 30, ["Conveyor drive motor 4 kW"]]]],
    ["PBB", "Passenger boarding bridges", Array.from({ length: 8 }, (_, i) => [`PBB-${String(i + 1).padStart(2, "0")}`, `Boarding bridge, gate ${200 + i + 1}`, "pbb", "electrical", (i < 4 ? "A" : "B") as Criticality, `Pier B gate ${200 + i + 1}`, "TK-type", 30, ["PBB drive wheel assembly", "PCA filter set"]] as A)],
    ["VT", "Lifts & escalators", [["ES-D01", "Escalator, departures 1", "escalator", "lifts", "B", "Departures", "Otis-type", 30, ["Escalator step chain"]], ["ES-D02", "Escalator, departures 2", "escalator", "lifts", "B", "Departures", "Otis-type", 30, ["Escalator step chain"]], ["ES-A05", "Escalator, arrivals 5", "escalator", "lifts", "B", "Arrivals", "Otis-type", 30, ["Escalator step chain"]], ["LF-07", "Passenger lift 7 (PRM)", "lift", "lifts", "A", "Pier B", "KONE-type", 30, ["Lift door operator"]], ["LF-08", "Passenger lift 8", "lift", "lifts", "B", "Pier B", "KONE-type", 30, ["Lift door operator"]]]],
    ["HVAC", "Cooling & air handling", [["CH-01", "Chiller 1 (3,000 TR)", "chiller", "hvac", "A", "Central plant", "York-type", 60, ["Chiller oil filter"]], ["CH-02", "Chiller 2 (3,000 TR)", "chiller", "hvac", "A", "Central plant", "York-type", 60, ["Chiller oil filter"]], ["CH-03", "Chiller 3 (3,000 TR)", "chiller", "hvac", "A", "Central plant", "York-type", 60, ["Chiller oil filter"]], ["CH-04", "Chiller 4 (standby)", "chiller", "hvac", "A", "Central plant", "York-type", 60, ["Chiller oil filter"]], ["AHU-D12", "AHU departures hall 12", "ahu", "hvac", "B", "Departures", "Trane-type", 30, ["AHU filter set"]], ["AHU-B03", "AHU pier B 3", "ahu", "hvac", "B", "Pier B", "Trane-type", 30, ["AHU filter set"]]]],
    ["PWR", "Power & lighting", [["UPS-T2", "Terminal UPS", "ups", "electrical", "A", "Main substation", "Schneider-type", 90], ["GEN-T2-1", "Standby generator 1", "genset", "electrical", "A", "Main substation", "Caterpillar-type", 30], ["CCR-RWY", "Runway lighting regulators", "ccr", "electrical", "A", "Airfield", "ADB-type", 30], ["FP-01", "Fire pump set", "firepump", "mechanical", "A", "Central plant", "Grundfos-type", 7]]],
  ],
  techs: [["Majed Al-Anazi", "Duty maintenance manager", ["mechanical", "electrical"], "day", "Airport operations centre", 15], ["Arun Pillai", "BHS technician", ["mechanical", "controls"], "day", "Baggage hall", 8], ["Saad Al-Mutairi", "BHS technician", ["mechanical"], "day", "Baggage hall", 3], ["Lina Haddad", "Electrical technician", ["electrical"], "day", "Pier B", 6], ["Tomasz Nowak", "Lift & escalator technician", ["lifts"], "day", "Departures", 10], ["Bilal Ahmed", "HVAC technician", ["hvac"], "day", "Central plant", 7], ["Turki Al-Shammari", "Airfield electrician", ["electrical"], "night", "Airfield", 9], ["Ravi Menon", "PBB technician", ["electrical", "mechanical"], "day", "Pier B", 5], ["Noura Al-Saud", "BMS engineer", ["controls", "hvac"], "day", "Airport operations centre", 6], ["Emre Kaya", "HVAC technician", ["hvac"], "night", "Central plant", 4],
    ["Hessa Al-Dossary", "Airport security duty manager", ["process"], "day", "Airport operations centre", 11], ["Omar Bakri", "Airfield operations officer (wildlife & FOD)", ["process"], "day", "Airfield", 8]],
  spares: [["Sorter tray", 14, 10, 21, 1800, "BHS store"], ["Conveyor drive motor 4 kW", 1, 3, 18, 6200, "BHS store"], ["PBB drive wheel assembly", 0, 1, 35, 17500, "Apron store"], ["PCA filter set", 6, 8, 7, 950, "Apron store"], ["Escalator step chain", 1, 1, 60, 54000, "VT store"], ["Lift door operator", 1, 1, 21, 12800, "VT store"], ["Chiller oil filter", 5, 4, 10, 780, "Central plant store"], ["AHU filter set", 9, 12, 7, 1350, "Central plant store"]],
  story: [["PBB-03", "down", "critical", "Boarding bridge gate 203 drive fault: bridge cannot dock"], ["BHS-SRT-1", "degraded", "high", "Sorter 1: 14 jams in 24 h, tray 112 sticking"], ["CH-02", "running", "medium", "Chiller 2 efficiency 0.79 kW/TR: condenser fouling"], ["LF-07", "degraded", "medium", "PRM lift 7: 7 door faults in 24 h"]],
};

const GAS: Plant = {
  f: { id: "kgpp", name: "Kinan Gas Processing Plant", sector: "oil_gas", location: "Eastern Province (demo)", operator: "Kinan Energy — Gas Operations", capacity: "600 MMSCFD sour gas · 3 compression trains · sales gas & NGL",
    description: "Sour gas from the field is separated, compressed, sweetened in an amine unit, dried and chilled for NGL recovery, then exported as sales gas by pipeline. Compressor train B is in a turnaround this week, run by contractor crews; robots make the daily inspection rounds in the hazardous areas.",
    output: { name: "Sales gas", unit: "MMSCFD", target: 520 }, efficiency: { name: "Fuel & flare loss", unit: "%", target: 2.0, base: 2.3, lowerIsBetter: true } },
  systems: [
    ["INL", "Inlet & separation", [["SC-100", "Slug catcher", "separator", "process", "A", "Inlet & separation", "Fabricated (demo)", 180], ["V-101", "Inlet separator", "separator", "process", "A", "Inlet & separation", "Fabricated (demo)", 180], ["GD-INL-1", "Gas detector, inlet area", "detector", "instrumentation", "A", "Inlet & separation", "Dräger-type", 90, ["Gas detector sensor head"]]]],
    ["CMP", "Compression", [["K-201A", "Gas compressor train A", "gascomp", "rotating", "A", "Compression", "Siemens-type (demo)", 90, ["Dry gas seal cartridge", "Compressor bearing set"]], ["K-201B", "Gas compressor train B", "gascomp", "rotating", "A", "Compression", "Siemens-type (demo)", 90, ["Dry gas seal cartridge", "Compressor bearing set"]], ["K-201C", "Gas compressor train C (standby)", "gascomp", "rotating", "A", "Compression", "Siemens-type (demo)", 90, ["Dry gas seal cartridge", "Compressor bearing set"]], ["GD-COMP-2", "Gas detector, K-201A seal-gas panel", "detector", "instrumentation", "A", "Compression", "Dräger-type", 90, ["Gas detector sensor head"]]]],
    ["AGR", "Gas treating (amine)", [["C-301", "Amine contactor", "amine", "process", "A", "Gas treating (amine)", "Fabricated (demo)", 365], ["P-303A", "Lean amine pump A", "pump", "mechanical", "A", "Gas treating (amine)", "Flowserve-type", 60, ["Mechanical seal 80 mm"]], ["P-303B", "Lean amine pump B (standby)", "pump", "mechanical", "A", "Gas treating (amine)", "Flowserve-type", 60, ["Mechanical seal 80 mm"]], ["GD-AGR-1", "Gas detector, amine unit (H₂S)", "detector", "instrumentation", "A", "Gas treating (amine)", "Dräger-type", 90, ["Gas detector sensor head"]]]],
    ["DHY", "Dehydration & NGL", [["C-401", "TEG contactor", "teg", "process", "A", "Dehydration & NGL", "Fabricated (demo)", 365], ["X-501", "Turbo-expander", "expander", "rotating", "A", "Dehydration & NGL", "Atlas Copco-type (demo)", 120]]],
    ["FLR", "Flare", [["F-901", "HP flare stack", "flare", "process", "A", "Flare", "Zeeco-type (demo)", 180, ["Flare pilot assembly"]]]],
    ["TNK", "Tank farm", [["T-701A", "Condensate tank A", "tank", "inspection", "B", "Tank farm", "API 650 (demo)", 365], ["T-701B", "Condensate tank B", "tank", "inspection", "B", "Tank farm", "API 650 (demo)", 365]]],
    ["UTL", "Utilities & power", [["GTG-1", "Gas turbine generator 1", "gt", "mechanical", "A", "Utilities & power", "Solar-type (demo)", 90, ["GT inlet filter set"]], ["K-961", "Instrument-air compressor", "compressor", "mechanical", "B", "Utilities & power", "Atlas-type", 30, ["Compressor service kit"]], ["P-951A", "Fire-water pump A", "firepump", "mechanical", "A", "Utilities & power", "Grundfos-type", 7], ["PL-01", "Sales-gas export pipeline (to the coast and the export jetty)", "pipeline", "inspection", "A", "Export line & jetty", "48-inch (demo)", 180]]],
  ],
  techs: [["Majid Al-Rashid", "Operations manager", ["process"], "day", "Control room", 22], ["Abdulaziz Al-Mutlaq", "Control room supervisor", ["process", "mechanical"], "day", "Control room", 17], ["Hamad Al-Dosari", "Process operator", ["process"], "day", "Inlet & separation", 9], ["Feras Haddad", "Process operator", ["process"], "day", "Gas treating (amine)", 6],
    ["Kevin D'Souza", "Rotating equipment technician", ["rotating", "mechanical"], "day", "Compression", 11], ["Yasser Al-Amri", "Mechanical technician", ["mechanical"], "day", "Utilities & power", 5], ["Rajesh Iyer", "I&E technician", ["electrical", "instrumentation"], "day", "Control room", 8],
    ["Noura Al-Ghamdi", "HSE officer (gas tester)", ["process"], "day", "Control room", 7], ["Tom Walsh", "Inspection engineer", ["inspection"], "day", "Tank farm", 13], ["Saleh Al-Yami", "Process operator", ["process"], "night", "Compression", 10], ["Ali Hussain", "I&E technician", ["electrical", "instrumentation"], "night", "Utilities & power", 4],
    ["Fahad Al-Qahtani", "Security shift supervisor", ["process"], "day", "Main gate & security", 12],
    ["Daniel Okafor", "Remote pilot — drones and ROV (licensed)", ["inspection"], "day", "Robot dock", 6], ["Sultan Al-Otaibi", "Robot operator (heavy robots)", ["mechanical"], "day", "Robot dock", 4]],
  spares: [["Dry gas seal cartridge", 1, 2, 90, 185000, "Strategic store"], ["Compressor bearing set", 2, 1, 60, 46000, "Main store C-02"], ["Mechanical seal 80 mm", 1, 2, 21, 9800, "Main store A-12"], ["Flare pilot assembly", 0, 1, 30, 28000, "Main store F-01"], ["Gas detector sensor head", 4, 6, 14, 3200, "I&E store"], ["Compressor service kit", 1, 2, 7, 3400, "Main store C-01"], ["GT inlet filter set", 12, 8, 14, 1650, "Filter store"]],
  story: [["K-201B", "maintenance", null, "Turnaround: compressor train B isolated for overhaul"], ["GD-COMP-2", "running", "high", "Gas detector GD-COMP-2: flammable gas above the 20 % LEL alarm at the K-201A seal-gas panel"], ["P-303A", "degraded", "medium", "Lean amine pump P-303A vibration rising (robot acoustic check, 06:00 round)"], ["F-901", "running", "medium", "Flare F-901: one of four pilots out"], ["T-701A", "running", "low", "Condensate tank T-701A roof plates thinning (last survey 8.6 mm)"], ["K-201C", "running", null, "Compressor train C running in place of B during the turnaround"]],
};

export const PLANTS: Plant[] = [ENERGY, WATER, AIRPORT, GAS];
/** A technician's (fictional) mobile number: the same every day, so it can sign in to the field app and WhatsApp. */
export const techPhone = (plant: number, i: number) => `+96655${plant + 1}${String(i + 1).padStart(2, "0")}${String(1000 + i * 37).slice(-3)}0`;
export const SECTOR_LABEL: Record<Sector, string> = { energy: "Power & energy", water: "Water desalination", airport: "Airport", oil_gas: "Oil & gas" };
const PREFIX: Record<string, string> = { kcps: "E", krsd: "W", kgia: "A", kgpp: "G" };

const CHECK: Record<string, string[]> = {
  pump: ["Check vibration at both bearings", "Check bearing temperatures", "Inspect mechanical seal for leaks", "Check coupling alignment", "Record motor current"],
  hpump: ["Check vibration and bearing temperatures", "Inspect seal flush", "Check discharge pressure", "Grease motor bearings"],
  gt: ["Borescope inspection per OEM", "Check exhaust thermocouples", "Inspect inlet filters", "Review combustion dynamics"],
  st: ["Check shaft vibration trend", "Inspect gland steam system", "Test turbine trip valves"],
  hrsg: ["Inspect drum level transmitters", "Check safety valves", "Blowdown valve test"],
  transformer: ["Take oil sample for DGA", "Check silica gel breather", "Inspect bushings", "Thermal scan of connections"],
  breaker: ["Check SF₆ pressure", "Operate breaker under test", "Record contact resistance"],
  ro: ["Record feed and differential pressure", "Check permeate conductivity per vessel", "Inspect cartridge filters", "Prepare clean-in-place if ΔP > 3.0 bar"],
  uf: ["Integrity test", "Check backwash sequence", "Inspect valves"],
  erd: ["Check rotor speed and noise", "Record mixing", "Inspect high-pressure seals"],
  dosing: ["Calibrate dosing pump", "Check day-tank level", "Inspect diaphragm"],
  screen: ["Inspect screen panels", "Check spray-wash nozzles", "Lubricate drive chain"],
  chiller: ["Check refrigerant pressures", "Clean condenser tubes if approach > 4 °C", "Change oil filter", "Record kW/TR"],
  ahu: ["Change filters", "Check belt tension", "Clean coils"],
  escalator: ["Inspect step chain and comb plates", "Test emergency stops", "Check brake"],
  lift: ["Clean and adjust door operator", "Test safety gear", "Check levelling"],
  pbb: ["Test auto-level", "Inspect drive wheels", "Test PCA and GPU", "Check canopy"],
  bhs: ["Inspect sorter trays", "Check drive motors", "Clean photo-eyes", "Test emergency stops"],
  eds: ["Run test bag", "Check conveyor alignment", "Clean tunnel"],
  ups: ["Battery impedance test", "Check alarms", "Thermal scan"],
  genset: ["Run on load 30 min", "Check fuel and coolant", "Check starter batteries"],
  ccr: ["Insulation test", "Replace failed lamps", "Check regulator output"],
  firepump: ["Weekly churn test", "Check jockey pressure", "Record run time"],
  compressor: ["Change oil and filters", "Check discharge temperature", "Drain receiver"],
  separator: ["Check level transmitters against the gauge glass", "Test the high-level trip", "Inspect relief valve tags", "Record H₂S at the sample point (gas test first)"],
  gascomp: ["Record vibration and bearing temperatures", "Check seal-gas panel flows", "Inspect for leaks with a gas detector", "Test anti-surge valve stroke"],
  amine: ["Sample lean and rich amine", "Check foaming tendency", "Record treated-gas H₂S"],
  teg: ["Record dew point", "Check TEG purity and pH", "Inspect reboiler fire tube"],
  expander: ["Check bearing and seal oil", "Record vibration", "Test overspeed trip"],
  flare: ["Check every pilot is lit (camera / thermal)", "Inspect tip from a safe distance (drone)", "Check knock-out drum level"],
  tank: ["Ultrasonic wall thickness on the roof and lower shell", "Inspect the floating-roof seal", "Check earthing and vents"],
  pipeline: ["Cathodic-protection survey", "Check pig launcher and receiver", "Walk the right of way"],
  detector: ["Bump test with test gas", "Calibrate zero and span", "Check the alarm reaches the control room"],
};

/** The day's operating picture for every demo facility. */
export function generate(date: string): FmData {
  const out: FmData = { date, facilities: [], systems: [], assets: [], technicians: [], workOrders: [], alarms: [], spares: [], zones: [], contractors: [], crews: [], robots: [], missions: [], findingAcks: {}, securityAlerts: [] };
  const today = dayNo(date);
  for (const P of PLANTS) {
    const fid = P.f.id, pre = PREFIX[fid];
    const R = rng(today * 7 + fid.charCodeAt(1) * 131);          // changes with the date
    const S = rng(fid.charCodeAt(0) * 977 + fid.charCodeAt(2));  // fixed per facility (installed dates, ids)
    const story = new Map(P.story.map((x) => [x[0], x]));
    // assets
    let woN = 24100, alN = 1;
    for (const [code, name, list] of P.systems) {
      const sid = `${fid}:${code}`;
      out.systems.push({ id: sid, facilityId: fid, name, code });
      for (const [tag, aname, cls, trade, crit, zone, mfr, pmDays, spares] of list) {
        const st = story.get(tag);
        const standby = /standby/i.test(aname);
        const status: AssetStatus = st ? st[1] : standby ? "standby" : "running";
        const phase = Math.floor(S() * pmDays);
        const lastPm = addDays(date, -((today + phase) % pmDays) - 1);
        const prof = PROFILES[cls] ?? [];
        const readings: Reading[] = prof.map(([key, rname, unit, base, spread, low, high]) => {
          const drift = st && st[2] !== null && DRIFT[cls] === key; // a story without an alarm (a turnaround, a change-over) drifts nothing
          const towards = high ?? (low !== undefined ? low : base);
          const trend = Array.from({ length: 14 }, (_, k) => {
            const noise = (R() - 0.5) * spread * 1.2;
            const d = drift ? ((towards - base) * 1.12 * (k + 1)) / 14 * (low !== undefined && high === undefined ? 1.05 : 1) : 0;
            return r1((standby || status === "maintenance") && key !== "press" ? 0 : base + noise + d); // stopped: nothing to read
          });
          if (unit.startsWith("of ")) trend.forEach((v, j) => (trend[j] = Math.floor(v))); // a count ("3 of 4 pilots lit")
          return { key, name: rname, value: trend[13], unit, low, high, trend };
        });
        const outOf = readings.filter((r) => (r.high !== undefined && r.value > r.high) || (r.low !== undefined && r.value < r.low)).length;
        out.assets.push({
          id: `${fid}:${tag}`, tag, name: aname, facilityId: fid, systemId: sid, class: cls, trade, criticality: crit, status, zone,
          manufacturer: mfr, model: `${cls.toUpperCase()}-${Math.floor(100 + S() * 800)}`, installed: addDays(date, -Math.floor(600 + S() * 3200)),
          runHours: Math.floor(18000 + S() * 60000), condition: Math.max(18, Math.min(98, Math.round(92 - outOf * 22 - (status === "down" ? 30 : status === "degraded" ? 18 : 0) - S() * 10))),
          pmEveryDays: pmDays, lastPm, nextPm: addDays(lastPm, pmDays), readings, spares: spares ?? [],
        });
      }
    }
    // technicians
    P.techs.forEach(([name, role, trades, shift, zone, years], i) => {
      S(); // (the random draw a phone number once took: keeps the rest of the day's data unchanged)
      out.technicians.push({ id: `${fid}:t${i + 1}`, name, facilityId: fid, role, trades, shift, zone, years, phone: techPhone(PLANTS.indexOf(P), i), status: shift === "off" ? "off" : "available" });
    });
    // spares
    P.spares.forEach(([part, stock, min, lead, cost, loc], i) => out.spares.push({ id: `${fid}:s${i + 1}`, facilityId: fid, part, stock, min, leadDays: lead, unitCost: cost, location: loc }));
    const techs = out.technicians.filter((t) => t.facilityId === fid);
    const tech = (trade: Trade, k: number) => { const xs = techs.filter((t) => t.trades.includes(trade) && t.shift !== "off"); return xs.length ? xs[k % xs.length].id : undefined; };
    const assets = out.assets.filter((a) => a.facilityId === fid);
    const mk = (a: Asset, type: WoType, pr: Priority, status: WoStatus, title: string, raisedDaysAgo: number, dueIn: number, sla: number, extra: Partial<WorkOrder> = {}): WorkOrder => ({
      id: `WO-${pre}${woN++}`, facilityId: fid, assetId: a.id, type, priority: pr, status, title, detail: extra.detail ?? title,
      raised: atTime(addDays(date, -raisedDaysAgo), 6 + Math.floor(R() * 10), Math.floor(R() * 59)), due: addDays(date, dueIn), slaHours: sla,
      source: extra.source ?? (type === "PM" ? "schedule" : "control"), raisedBy: extra.raisedBy ?? (type === "PM" ? "Maintenance plan" : "Control room"),
      checklist: (CHECK[a.class] ?? ["Inspect", "Test", "Record"]).map((t, k) => ({ text: t, done: status === "done" || (status === "in_progress" && k < 2) })),
      spares: extra.spares ?? [], notes: extra.notes ?? [], evidence: [], ...extra,
    });
    // planned maintenance: due in the last 5 days (some overdue) and the next 14
    for (const a of assets) {
      const dueIn = dayNo(a.nextPm) - today;
      if (dueIn > 14 || dueIn < -5) continue;
      const overdue = dueIn < 0;
      const k = Math.floor(R() * 10);
      if (overdue && k >= 3) { // done on its due date: the next one is a full interval away
        const doneDay = a.nextPm;
        out.workOrders.push(mk(a, "PM", a.criticality === "A" ? "P2" : "P3", "done", `${a.pmEveryDays}-day planned maintenance — ${a.name}`, -dueIn + 2, dueIn, a.criticality === "A" ? 72 : 168,
          { assignee: tech(a.trade, k), started: atTime(doneDay, 8), done: atTime(doneDay, 8 + 2 + (k % 4)) }));
        a.lastPm = doneDay; a.nextPm = addDays(doneDay, a.pmEveryDays);
        continue;
      }
      const status: WoStatus = overdue ? (k < 2 ? "open" : "assigned") : dueIn <= 1 ? (k < 4 ? "in_progress" : "assigned") : k < 5 ? "open" : "assigned";
      out.workOrders.push(mk(a, "PM", a.criticality === "A" ? "P2" : "P3", status, `${a.pmEveryDays}-day planned maintenance — ${a.name}`, Math.max(0, -dueIn + 2), dueIn, a.criticality === "A" ? 72 : 168,
        { assignee: status === "open" ? undefined : tech(a.trade, k), started: status === "in_progress" ? atTime(date, 7, 30) : undefined }));
    }
    // the plan always has one late job for the orchestrator to re-plan (a criticality-B machine, nobody on it yet)
    if (!out.workOrders.some((w) => w.facilityId === fid && w.type === "PM" && w.status !== "done" && w.due < date)) {
      const b = assets.find((a) => a.criticality === "B" && a.status === "running" && !out.workOrders.some((w) => w.assetId === a.id && w.status !== "done"));
      if (b) out.workOrders.push(mk(b, "PM", "P3", "open", `${b.pmEveryDays}-day planned maintenance — ${b.name}`, 4, -2, 168));
    }
    // corrective work today's story asks for: some already raised, others left to the orchestrator
    P.story.forEach(([tag, , sev, msg], i) => {
      const a = assets.find((x) => x.tag === tag)!;
      const al: Alarm | null = sev ? { id: `AL-${pre}${String(alN++).padStart(3, "0")}`, facilityId: fid, assetId: a.id, at: atTime(date, 2 + i * 2, 15 + i * 7), severity: sev, message: msg, reading: a.readings.find((r) => r.key === DRIFT[a.class])?.name, acknowledged: false } : null;
      if (i % 2 === 1 && al) {
        const wo = mk(a, "CM", sev === "critical" ? "P1" : sev === "high" ? "P2" : "P3", i === 1 ? "in_progress" : "assigned", `Investigate: ${msg.split(":")[0]}`, 0, sev === "critical" ? 0 : 2, sev === "critical" ? 4 : sev === "high" ? 24 : 72,
          { source: "sensor", raisedBy: "Condition monitoring", assignee: tech(a.trade, i), started: i === 1 ? atTime(date, 8, 10) : undefined, detail: msg, notes: [{ at: atTime(date, 8, 20), by: "Control room", text: "Raised from the alarm; standby checked." }] });
        out.workOrders.push(wo); al.acknowledged = true; al.woId = wo.id;
      }
      if (al) out.alarms.push(al);
    });
    // a few low-severity alarms
    for (const a of assets.filter(() => R() < 0.06).slice(0, 3)) out.alarms.push({ id: `AL-${pre}${String(alN++).padStart(3, "0")}`, facilityId: fid, assetId: a.id, at: atTime(date, Math.floor(R() * 8), Math.floor(R() * 59)), severity: "low", message: `${a.name}: ${a.readings[0]?.name ?? "reading"} near limit`, acknowledged: R() < 0.5 });
    // older corrective work: on hold for parts, and the last week's closed jobs (for MTTR and MTBF)
    const holdA = assets.find((a) => a.spares.some((s) => P.spares.find((x) => x[0] === s && x[1] < x[2])));
    if (holdA) {
      const part = holdA.spares.find((s) => P.spares.find((x) => x[0] === s && x[1] < x[2]))!;
      out.workOrders.push(mk(holdA, "CM", "P3", "on_hold", `Replace worn part — ${holdA.name}`, 6, 4, 168, { assignee: tech(holdA.trade, 3), holdReason: `Waiting for ${part}`, spares: [{ part, qty: 1 }], detail: `Wear found at the last inspection; ${part} needed.` }));
    }
    for (let k = 0; k < 9; k++) {
      const a = assets[Math.floor(R() * assets.length)];
      const ago = 1 + Math.floor(R() * 7);
      const hrs = 1 + Math.floor(R() * 9);
      const raised = atTime(addDays(date, -ago), 6 + Math.floor(R() * 8));
      out.workOrders.push(mk(a, R() < 0.35 ? "CM" : "Inspection", R() < 0.2 ? "P2" : "P3", "done", R() < 0.5 ? `Fault reset and inspection — ${a.name}` : `Routine inspection — ${a.name}`, ago, -ago + 1, 72,
        { assignee: tech(a.trade, k), started: raised, done: new Date(Date.parse(raised) + hrs * 3600_000).toISOString(), raised, notes: [{ at: raised, by: "Field technician", text: "Done, back in service." }] }));
    }
    // output today and the last 14 days
    const derate = P.story.filter((x) => x[1] === "down" || x[1] === "degraded").length * 0.012;
    const trend = Array.from({ length: 14 }, (_, k) => Math.round(P.f.output.target * (0.955 + R() * 0.05 - (k > 10 ? derate : 0))));
    const eff = P.f.efficiency;
    out.facilities.push({ ...P.f, output: { ...P.f.output, today: trend[13], trend }, efficiency: { name: eff.name, unit: eff.unit, target: eff.target, lowerIsBetter: eff.lowerIsBetter, value: r1(eff.base * (1 + (R() - 0.5) * 0.01) * (eff.lowerIsBetter ? 1 + derate / 2 : 1 - derate)) } });
  }
  // the gas plant's working world: zones, contractor crews, robots and their missions, the turnaround (gasplant.ts)
  addGasWork(out, date);
  addAirportWork(out, date);
  return out;
}
