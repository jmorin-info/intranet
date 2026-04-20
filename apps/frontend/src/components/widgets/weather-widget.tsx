'use client';

import React, { useState, useEffect } from 'react';
import { Cloud, Sun, CloudRain, CloudSnow, CloudLightning, Wind, Droplets, MapPin, ExternalLink, Car } from 'lucide-react';

interface WeatherData {
  temperature: number;
  weatherCode: number;
  windSpeed: number;
  humidity: number;
  description: string;
  forecast: Array<{
    date: string;
    tMin: number;
    tMax: number;
    code: number;
  }>;
}

const weatherLabels: Record<number, string> = {
  0: 'Ensoleille', 1: 'Peu nuageux', 2: 'Partiellement couvert', 3: 'Couvert',
  45: 'Brouillard', 48: 'Brouillard givrant',
  51: 'Bruine', 53: 'Bruine', 55: 'Bruine forte',
  61: 'Pluie legere', 63: 'Pluie', 65: 'Pluie forte',
  71: 'Neige legere', 73: 'Neige', 75: 'Neige forte',
  80: 'Averses', 81: 'Averses', 82: 'Averses fortes',
  95: 'Orage', 96: 'Orage grele',
};

function getWeatherIcon(code: number) {
  if (code <= 1) return Sun;
  if (code <= 3 || code === 45 || code === 48) return Cloud;
  if (code >= 51 && code <= 67) return CloudRain;
  if (code >= 71 && code <= 77) return CloudSnow;
  if (code >= 80 && code <= 82) return CloudRain;
  if (code >= 95) return CloudLightning;
  return Cloud;
}

const CITIES = [
  { name: 'Paris', lat: 48.8566, lon: 2.3522, trafficUrl: 'https://www.sytadin.fr/', trafficLabel: 'Sytadin' },
  { name: 'PACA', lat: 43.2965, lon: 5.3698, trafficUrl: 'https://www.google.com/maps/@43.2965,5.3698,12z/data=!5m1!1e1', trafficLabel: 'Google Maps Trafic' },
  { name: 'Bordeaux', lat: 44.8378, lon: -0.5792, trafficUrl: 'https://www.google.com/maps/@44.8378,-0.5792,12z/data=!5m1!1e1', trafficLabel: 'Google Maps Trafic' },
];

function formatDay(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
  } catch {
    return '';
  }
}

export function WeatherWidget() {
  const [cityIdx, setCityIdx] = useState(0);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  const city = CITIES[cityIdx] || CITIES[0]!;

  useEffect(() => {
    setLoading(true);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code&forecast_days=3&timezone=Europe/Paris`;
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (d.current && d.daily) {
          const forecast = (d.daily.time || []).map((t: string, i: number) => ({
            date: t,
            tMin: Math.round(d.daily.temperature_2m_min[i]),
            tMax: Math.round(d.daily.temperature_2m_max[i]),
            code: d.daily.weather_code[i],
          }));
          setWeather({
            temperature: Math.round(d.current.temperature_2m),
            weatherCode: d.current.weather_code,
            windSpeed: Math.round(d.current.wind_speed_10m),
            humidity: d.current.relative_humidity_2m,
            description: weatherLabels[d.current.weather_code] || 'Inconnu',
            forecast,
          });
        }
      })
      .catch(() => setWeather(null))
      .finally(() => setLoading(false));
  }, [city.lat, city.lon]);

  const WeatherIcon = weather ? getWeatherIcon(weather.weatherCode) : Cloud;

  return (
    <div>
      <div className="flex gap-1 mb-3">
        {CITIES.map((c, i) => (
          <button
            key={c.name}
            onClick={() => setCityIdx(i)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors ${
              i === cityIdx
                ? 'bg-navy text-white dark:bg-blue-600'
                : 'bg-gray-100 dark:bg-slate-700 text-taupe dark:text-slate-400 hover:bg-gray-200'
            }`}
          >
            <MapPin className="h-2.5 w-2.5" />
            {c.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-14 animate-pulse rounded-lg bg-gray-100 dark:bg-slate-700" />
      ) : weather ? (
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
            <WeatherIcon className="h-6 w-6 text-blue-500" />
          </div>
          <div>
            <span className="text-2xl font-semibold text-navy dark:text-white">{weather.temperature}°C</span>
            <p className="text-xs text-taupe dark:text-slate-400">{weather.description}</p>
          </div>
          <div className="flex gap-3 ml-auto text-[10px] text-taupe dark:text-slate-500">
            <span className="flex items-center gap-0.5"><Wind className="h-3 w-3" />{weather.windSpeed} km/h</span>
            <span className="flex items-center gap-0.5"><Droplets className="h-3 w-3" />{weather.humidity}%</span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-[#837274]">Météo indisponible</p>
      )}

      {weather && weather.forecast && weather.forecast.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
          <div className="grid grid-cols-3 gap-2">
            {weather.forecast.slice(0, 3).map((f) => {
              const Icon = getWeatherIcon(f.code);
              return (
                <div key={f.date} className="text-center">
                  <p className="text-[10px] text-taupe dark:text-slate-500 uppercase mb-1">{formatDay(f.date)}</p>
                  <Icon className="h-4 w-4 text-blue-500 mx-auto mb-1" />
                  <p className="text-[11px] font-medium text-navy dark:text-white tabular-nums">
                    {f.tMin}° / {f.tMax}°
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <a
        href={city.trafficUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-900/40 hover:bg-orange-100 transition"
      >
        <div className="flex items-center gap-2">
          <Car className="h-3.5 w-3.5 text-orange-500" />
          <span className="text-[11px] font-medium text-navy dark:text-white">
            Trafic {city.name} — {city.trafficLabel}
          </span>
        </div>
        <ExternalLink className="h-3 w-3 text-orange-500" />
      </a>
    </div>
  );
}
