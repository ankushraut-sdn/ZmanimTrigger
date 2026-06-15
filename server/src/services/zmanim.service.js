import axios from 'axios';
import { DateTime } from 'luxon';
import { parseISO, isAfter, addDays, format } from 'date-fns';
import config from '../config/index.js';

/**
 * Get Latitude and Longitude for a given region using Geoapify API.
 * Falls back to New York coordinates if lookup fails or key is missing.
 */
export async function getLatLon(region) {
  const apiKey = config.geoapifyKey;
  if (!apiKey) {
    console.warn('⚠️ GEOAPIFY_KEY not set. Using default coordinates.');
    return { lat: 40.7128, lon: -74.0060 }; // New York default
  }

  try {
    const cleanRegion = region.replace('United States/', 'America/');
    const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(cleanRegion)}&apiKey=${apiKey}`;
    const resp = await axios.get(url);
    if (resp.data && resp.data.features && resp.data.features.length > 0) {
      const { lat, lon } = resp.data.features[0].properties;
      return { lat, lon };
    }
  } catch (err) {
    console.error(`❌ Geoapify Geocoding failed: ${err.message}. Using default.`);
  }

  return { lat: 40.7128, lon: -74.0060 }; // New York default
}

/**
 * Fetch calendar events from Hebcal API.
 */
export async function fetchHebcal(lat, lon, startDateStr, endDateStr) {
  // Extend end date by 7 days to ensure multi-day festivals are captured
  const start = parseISO(startDateStr);
  const end = parseISO(endDateStr);
  const extendedEndStr = format(addDays(end, 7), 'yyyy-MM-dd');

  const url = `https://www.hebcal.com/hebcal/?v=1&cfg=json&latitude=${lat}&longitude=${lon}&start=${startDateStr}&end=${extendedEndStr}&maj=on&min=on&nx=on`;
  const resp = await axios.get(url);
  return resp.data.items || [];
}

/**
 * Pair candle lighting times (relays turn ON) with Havdalah times (relays turn OFF).
 */
export function pairCandlesWithHavdalah(items) {
  const candles = items.filter(i => i.category === 'candles');
  const havdalahs = items.filter(i => i.category === 'havdalah');

  const results = [];
  let havdalahIndex = 0;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    let offTime = null;

    // Find the first Havdalah after this candle lighting time
    while (
      havdalahIndex < havdalahs.length &&
      !isAfter(parseISO(havdalahs[havdalahIndex].date), parseISO(candle.date))
    ) {
      havdalahIndex++;
    }

    if (havdalahIndex < havdalahs.length) {
      offTime = havdalahs[havdalahIndex].date;
    } else if (i + 1 < candles.length) {
      // Fallback: If no Havdalah found, use next candle lighting time as end
      offTime = candles[i + 1].date;
    } else {
      // Last candle fallback: assume 25 hours duration (or 1 day)
      offTime = addDays(parseISO(candle.date), 1).toISOString();
    }

    results.push({
      on: new Date(candle.date),
      off: new Date(offTime),
      comment: candle.memo || candle.title || 'Shabbat/Holiday'
    });
  }

  return results;
}

/**
 * Primary orchestrator to get ON/OFF intervals for a region.
 */
export async function getOnOffPairs(region, startDate, endDate) {
  const { lat, lon } = await getLatLon(region);
  const items = await fetchHebcal(lat, lon, startDate, endDate);
  return pairCandlesWithHavdalah(items);
}

/**
 * Retrieve current timezone offset in minutes for a region name (e.g., "America/New_York").
 */
export function getTimezoneOffsetMinutes(region) {
  try {
    // Standardize to IANA name if prefix matches
    let ianaZone = region.replace('United States/', 'America/');
    // Fallback overrides for common regions
    if (ianaZone.toLowerCase() === 'new york') ianaZone = 'America/New_York';
    if (ianaZone.toLowerCase() === 'jerusalem') ianaZone = 'Asia/Jerusalem';
    
    const dt = DateTime.now().setZone(ianaZone);
    if (dt.isValid) {
      return dt.offset; // minutes offset (e.g., -240 for EDT)
    }
  } catch (err) {
    console.error(`Error resolving timezone offset for ${region}:`, err);
  }
  // Fallback to local server offset
  return -new Date().getTimezoneOffset();
}
