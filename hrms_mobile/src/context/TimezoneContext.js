import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import { setTimezone as setGlobalTimezone } from '../utils/timezone';

const TimezoneContext = createContext();

const DEFAULT_TIMEZONE = 'Asia/Kolkata';

export const TimezoneProvider = ({ children }) => {
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [dateFormat, setDateFormat] = useState('DD/MM/YYYY');

  const loadTimezone = useCallback(async () => {
    try {
      const res = await api.get('/settings/general');
      const tz = res.data?.timezone || DEFAULT_TIMEZONE;
      const df = res.data?.dateFormat || 'DD/MM/YYYY';
      setTimezone(tz);
      setDateFormat(df);
      setGlobalTimezone(tz);
      await AsyncStorage.setItem('app_timezone', tz);
      await AsyncStorage.setItem('app_date_format', df);
    } catch {
      const saved = await AsyncStorage.getItem('app_timezone');
      if (saved) {
        setTimezone(saved);
        setGlobalTimezone(saved);
      }
    }
  }, []);

  useEffect(() => { loadTimezone(); }, [loadTimezone]);

  const formatTime = useCallback((dateInput) => {
    if (!dateInput) return '—';
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  }, [timezone]);

  const formatDate = useCallback((dateInput) => {
    if (!dateInput) return '—';
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(d);
  }, [timezone]);

  const formatDateTime = useCallback((dateInput) => {
    if (!dateInput) return '—';
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(d);
  }, [timezone]);

  const formatWeekday = useCallback((dateInput) => {
    if (!dateInput) return '';
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
    }).format(d);
  }, [timezone]);

  const getZoneDate = useCallback((dateInput) => {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : (dateInput || new Date());
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);
    const map = {};
    parts.forEach((p) => { if (p.type !== 'literal') map[p.type] = p.value; });
    return `${map.year}-${map.month}-${map.day}`;
  }, [timezone]);

  return (
    <TimezoneContext.Provider value={{
      timezone,
      dateFormat,
      formatTime,
      formatDate,
      formatDateTime,
      formatWeekday,
      getZoneDate,
      refresh: loadTimezone,
    }}>
      {children}
    </TimezoneContext.Provider>
  );
};

export const useTimezone = () => useContext(TimezoneContext);
