import { useState, useEffect } from 'react';
import { Clock, LogIn, LogOut, MapPin, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { getMyEmployee, checkIn, checkOut, getMyAttendanceToday } from '../../services/employeeSelfService';
import { formatAppDate } from '../../services/appSettingsService';

const EmployeeAttendance = () => {
  const { user } = useAuth();
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [active, setActive] = useState<Record<string, unknown> | null>(null);
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);

  const refresh = (eid: number) => {
    getMyAttendanceToday(eid).then((rows: Record<string, unknown>[]) => {
      const a = rows.find((r) => (r.status || 'present') === 'present' && !(r.check_out ?? r.checkOut));
      setActive(a || null);
      setHistory(rows);
    });
  };

  useEffect(() => {
    getMyEmployee().then((e) => {
      if (e) { setEmployeeId(e.id); refresh(e.id); }
    });
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => {},
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, []);

  const handleCheckIn = async () => {
    if (!employeeId) return;
    if (!coords?.lat || !coords?.lon) {
      toast.error('Location is required. Please enable GPS and allow location access.');
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
          () => {},
          { enableHighAccuracy: true, timeout: 10000 }
        );
      }
      return;
    }
    setLoading(true);
    try {
      await checkIn({
        employeeId,
        latitude: coords.lat,
        longitude: coords.lon,
        locationName: 'Current location',
        deviceType: 'web',
        requestSource: 'mobile_pwa',
      });
      toast.success('Checked in successfully');
      refresh(employeeId);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err.response?.data?.detail || 'Failed to check in');
    } finally { setLoading(false); }
  };

  const handleCheckOut = async () => {
    if (!employeeId) return;
    if (!coords?.lat || !coords?.lon) {
      toast.error('Location is required. Please enable GPS and allow location access.');
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
          () => {},
          { enableHighAccuracy: true, timeout: 10000 }
        );
      }
      return;
    }
    setLoading(true);
    try {
      await checkOut({ latitude: coords.lat, longitude: coords.lon, locationName: 'Current location' });
      toast.success('Checked out successfully');
      refresh(employeeId);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      toast.error(err.response?.data?.detail || 'Failed to check out');
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-5">
      {/* Status card */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5 text-center">
        <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-3 ${active ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
          <Clock className="w-8 h-8" />
        </div>
        <p className="text-lg font-semibold text-slate-800">{active ? 'You are checked in' : 'Not checked in'}</p>
        <p className="text-sm text-slate-400 mt-1">{active ? `Since ${formatAppDate((active.check_in ?? active.checkIn) as string)}` : 'Check in to start your work day'}</p>
        {coords && (
          <p className="text-xs text-slate-400 mt-2 flex items-center justify-center gap-1"><MapPin className="w-3 h-3" /> Location detected</p>
        )}
        {!coords && (
          <p className="text-xs text-amber-500 mt-2 flex items-center justify-center gap-1"><MapPin className="w-3 h-3" /> Location required — enable GPS</p>
        )}
        <div className="mt-5">
          {!active ? (
            <button onClick={handleCheckIn} disabled={loading || !coords} className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-blue-600 text-white rounded-2xl font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />} {coords ? 'Check In' : 'Enable GPS First'}
            </button>
          ) : (
            <button onClick={handleCheckOut} disabled={loading || !coords} className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-emerald-600 text-white rounded-2xl font-semibold hover:bg-emerald-700 disabled:opacity-60 transition-colors">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogOut className="w-5 h-5" />} {coords ? 'Check Out' : 'Enable GPS First'}
            </button>
          )}
        </div>
      </div>

      {/* Today's records */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <p className="text-xs font-medium text-slate-400 uppercase mb-3">Today's Records</p>
        {history.length === 0 ? (
          <p className="text-sm text-slate-400">No records for today</p>
        ) : (
          <div className="space-y-2">
            {history.map((h, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-700">{h.check_in || h.checkIn ? formatAppDate((h.check_in || h.checkIn) as string) : '-'}</p>
                  <p className="text-xs text-slate-400">{(h.status as string || 'present').replace('_', ' ')}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${(h.check_out || h.checkOut) ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-600'}`}>
                  {(h.check_out || h.checkOut) ? 'Out' : 'In'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default EmployeeAttendance;
