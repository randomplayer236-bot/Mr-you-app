/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { 
  Users, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  LogOut, 
  Settings as SettingsIcon, 
  Trash2, 
  Plus, 
  Globe, 
  Calendar,
  User,
  Scissors,
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  Camera,
  Image as ImageIcon,
  Upload,
  Bell
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  addDoc, 
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, addMinutes, isAfter, parseISO } from 'date-fns';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Error Handling Spec ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Error Boundary ---
class ErrorBoundary extends (React.Component as any) {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
  componentDidCatch(error: any, info: any) { console.error(error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-red-500/10 border border-red-500/20 rounded-[2.5rem] p-10">
            <AlertCircle className="text-red-400 mx-auto mb-4" size={48} />
            <h2 className="text-2xl font-bold text-white mb-4">Application Error</h2>
            <p className="text-red-200/60 text-sm mb-8">{this.state.error?.message || "Something went wrong"}</p>
            <button onClick={() => window.location.reload()} className="px-8 py-3 bg-red-500 text-white rounded-2xl font-bold hover:bg-red-400">Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Types ---
type Role = 'admin' | 'manager' | 'worker' | 'client';
type Status = 'available' | 'working' | 'unavailable';
type BookingStatus = 'pending' | 'completed' | 'missed';

interface Barber { id: string; name: string; status: Status; photoUrl?: string; order: number; }
interface Booking { 
  id: string; 
  barberId: string; 
  clientName: string; 
  date: string; 
  time: string; 
  dayName: string;
  status: BookingStatus; 
  createdAt: any; 
  notified?: boolean;
}

interface Notification {
  id: string;
  barberId: string;
  message: string;
  createdAt: any;
  read: boolean;
}

const TRANSLATIONS = {
  en: {
    title: 'MR you', subtitle: 'Premium Barber Shop', available: 'Available', working: 'Working', unavailable: 'Unavailable',
    bookNow: 'Book Now', clientName: 'Your Name', pickTime: 'Pick Time', pickDate: 'Pick Date', confirm: 'Confirm Booking', cancel: 'Cancel',
    admin: 'Admin', manager: 'Manager', worker: 'Worker', login: 'Login', password: 'Password', clearDay: 'Clear Day',
    workingDays: 'Tuesday - Sunday (10:00 - 22:00)', tenMinRule: 'Note: Max 10 mins late or booking missed.',
    done: 'Done', delete: 'Delete', noBookings: 'No bookings', clientsBefore: 'Clients before you', logout: 'Logout',
    notifications: 'Notifications', newBooking: 'New booking from', at: 'at'
  },
  fr: {
    title: 'MR you', subtitle: 'Barbier de Prestige', available: 'Disponible', working: 'En cours', unavailable: 'Indisponible',
    bookNow: 'Réserver', clientName: 'Votre Nom', pickTime: 'Choisir l\'heure', pickDate: 'Choisir la date', confirm: 'Confirmer', cancel: 'Annuler',
    admin: 'Admin', manager: 'Gérant', worker: 'Coiffeur', login: 'Connexion', password: 'Mot de passe', clearDay: 'Effacer',
    workingDays: 'Mardi - Dimanche (10:00 - 22:00)', tenMinRule: 'Note: Max 10 min de retard ou annulé.',
    done: 'Terminé', delete: 'Supprimer', noBookings: 'Aucune réservation', clientsBefore: 'Clients avant vous', logout: 'Déconnexion',
    notifications: 'Notifications', newBooking: 'Nouvelle réservation de', at: 'à'
  },
  ar: {
    title: 'MR you', subtitle: 'صالون حلاقة فاخر', available: 'متاح', working: 'يعمل', unavailable: 'غير متاح',
    bookNow: 'احجز الآن', clientName: 'اسمك', pickTime: 'اختر الوقت', pickDate: 'اختر التاريخ', confirm: 'تأكيد الحجز', cancel: 'إلغاء',
    admin: 'مسؤول', manager: 'مدير', worker: 'حلاق', login: 'تسجيل الدخول', password: 'كلمة المرور', clearDay: 'مسح اليوم',
    workingDays: 'الثلاثاء - الأحد (10:00 - 22:00)', tenMinRule: 'ملاحظة: 10 دقائق كحد أقصى للوصول.',
    done: 'تم', delete: 'حذف', noBookings: 'لا يوجد حجوزات', clientsBefore: 'عملاء قبلك', logout: 'تسجيل الخروج',
    notifications: 'الإشعارات', newBooking: 'حجز جديد من', at: 'في'
  }
};

function BarberShop() {
  const [lang, setLang] = useState<'en' | 'fr' | 'ar'>('en');
  const [userRole, setUserRole] = useState<Role>('client');
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [settings, setSettings] = useState({ currentDay: 'Thursday', logoUrl: '' });
  const [showLogin, setShowLogin] = useState(false);
  const [loginForm, setLoginForm] = useState({ name: '', password: '' });
  const [bookingModal, setBookingModal] = useState<{ barberId: string } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [alertModal, setAlertModal] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [bookingTime, setBookingTime] = useState('');
  const [bookingDate, setBookingDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';

  useEffect(() => {
    const qB = query(collection(db, 'barbers'), orderBy('order'));
    const unsubB = onSnapshot(qB, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Barber));
      if (data.length === 0) {
        const batch = writeBatch(db);
        for (let i = 1; i <= 8; i++) {
          batch.set(doc(collection(db, 'barbers')), { name: `Barber n.o${i}`, status: 'unavailable', order: i });
        }
        batch.commit().catch(e => handleFirestoreError(e, OperationType.WRITE, 'barbers'));
      }
      setBarbers(data);
    }, (e) => handleFirestoreError(e, OperationType.GET, 'barbers'));

    const qBk = query(collection(db, 'bookings'), orderBy('createdAt', 'asc'));
    const unsubBk = onSnapshot(qBk, (snap) => {
      setBookings(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking)));
    }, (e) => handleFirestoreError(e, OperationType.GET, 'bookings'));

    const qN = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'));
    const unsubN = onSnapshot(qN, (snap) => {
      setNotifications(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification)));
    }, (e) => handleFirestoreError(e, OperationType.GET, 'notifications'));

    const unsubS = onSnapshot(doc(db, 'settings', 'global'), (snap) => {
      if (snap.exists()) {
        setSettings(snap.data() as any);
      } else {
        setDoc(doc(db, 'settings', 'global'), { currentDay: 'Thursday', logoUrl: '' })
          .catch(e => handleFirestoreError(e, OperationType.WRITE, 'settings/global'));
      }
    }, (e) => handleFirestoreError(e, OperationType.GET, 'settings/global'));

    return () => { unsubB(); unsubBk(); unsubN(); unsubS(); };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      bookings.forEach(async (b) => {
        if (b.status === 'pending') {
          try {
            const bTime = parseISO(`${b.date}T${b.time}`);
            if (isAfter(now, addMinutes(bTime, 10))) {
              await updateDoc(doc(db, 'bookings', b.id), { status: 'missed' })
                .catch(e => handleFirestoreError(e, OperationType.UPDATE, `bookings/${b.id}`));
            }
          } catch (e) {}
        }
      });
    }, 60000);
    return () => clearInterval(interval);
  }, [bookings]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const { name, password } = loginForm;
    if (name === 'sam' && password === 'sam2006') { setUserRole('admin'); setShowLogin(false); }
    else if (name === 'manager' && password === 'manager1234') { setUserRole('manager'); setShowLogin(false); }
    else if (name === 'worker' && password.startsWith('worker')) {
      const num = parseInt(password.replace('worker', ''));
      if (num >= 1 && num <= 8) {
        setUserRole('worker');
        setWorkerId(barbers.find(b => b.order === num)?.id || null);
        setShowLogin(false);
      }
    } else { setAlertModal('Invalid credentials'); }
  };

  const handleBooking = async () => {
    if (!clientName || !bookingTime || !bookingDate || !bookingModal) return;
    
    // Validate time 10:00 - 22:00
    const [hours, minutes] = bookingTime.split(':').map(Number);
    if (hours < 10 || hours >= 22) {
      setAlertModal('Shop is open from 10:00 to 22:00');
      return;
    }

    try {
      const barber = barbers.find(b => b.id === bookingModal.barberId);
      const dayName = format(parseISO(bookingDate), 'EEEE');
      
      const bookingRef = await addDoc(collection(db, 'bookings'), {
        barberId: bookingModal.barberId, 
        clientName, 
        date: bookingDate,
        time: bookingTime, 
        dayName,
        status: 'pending', 
        createdAt: serverTimestamp()
      });
      
      // Create notification
      await addDoc(collection(db, 'notifications'), {
        barberId: bookingModal.barberId,
        message: `${t.newBooking} ${clientName} ${t.at} ${bookingTime} (${dayName} ${bookingDate})`,
        createdAt: serverTimestamp(),
        read: false
      });

      setBookingModal(null); setClientName(''); setBookingTime('');
    } catch (e) { handleFirestoreError(e, OperationType.CREATE, 'bookings'); }
  };

  const markNotificationRead = async (id: string) => {
    try { await updateDoc(doc(db, 'notifications', id), { read: true }); }
    catch (e) { handleFirestoreError(e, OperationType.UPDATE, `notifications/${id}`); }
  };

  const clearDay = async () => {
    setConfirmModal({
      message: `Are you sure you want to clear all bookings for ${settings.currentDay}? This will delete all client names.`,
      onConfirm: async () => {
        try {
          const batch = writeBatch(db);
          bookings
            .filter(b => b.dayName === settings.currentDay || (!b.dayName && format(parseISO(b.date), 'EEEE') === settings.currentDay))
            .forEach(b => batch.delete(doc(db, 'bookings', b.id)));
          await batch.commit();
        } catch (e) { handleFirestoreError(e, OperationType.DELETE, 'bookings'); }
      }
    });
  };

  const updateCurrentDay = async (day: string) => {
    if (userRole !== 'admin' && userRole !== 'manager') return;
    try {
      await updateDoc(doc(db, 'settings', 'global'), { currentDay: day });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'settings/global'); }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 500000) {
      setAlertModal('Logo must be smaller than 500KB');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      try {
        await updateDoc(doc(db, 'settings', 'global'), { logoUrl: base64 });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, 'settings/global');
      }
    };
    reader.readAsDataURL(file);
  };

  const deleteLogo = async () => {
    setConfirmModal({
      message: 'Delete shop logo?',
      onConfirm: async () => {
        try {
          await updateDoc(doc(db, 'settings', 'global'), { logoUrl: '' });
        } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'settings/global'); }
      }
    });
  };

  const updateStatus = async (id: string, status: Status) => {
    try { await updateDoc(doc(db, 'barbers', id), { status }); }
    catch (e) { handleFirestoreError(e, OperationType.UPDATE, `barbers/${id}`); }
  };

  const handlePhoto = async (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      try { await updateDoc(doc(db, 'barbers', id), { photoUrl: reader.result as string }); }
      catch (err) { handleFirestoreError(err, OperationType.UPDATE, `barbers/${id}`); }
    };
    reader.readAsDataURL(file);
  };

  const deleteBarberPhoto = async (id: string) => {
    setConfirmModal({
      message: 'Delete this barber photo?',
      onConfirm: async () => {
        try { await updateDoc(doc(db, 'barbers', id), { photoUrl: '' }); }
        catch (e) { handleFirestoreError(e, OperationType.UPDATE, `barbers/${id}`); }
      }
    });
  };

  const completeBooking = async (id: string) => {
    try { await updateDoc(doc(db, 'bookings', id), { status: 'completed' }); }
    catch (e) { handleFirestoreError(e, OperationType.UPDATE, `bookings/${id}`); }
  };

  const deleteBooking = async (id: string) => {
    setConfirmModal({
      message: 'Delete this booking?',
      onConfirm: async () => {
        try { await deleteDoc(doc(db, 'bookings', id)); }
        catch (e) { handleFirestoreError(e, OperationType.DELETE, `bookings/${id}`); }
      }
    });
  };

  const clearNotifications = async () => {
    setConfirmModal({
      message: 'Clear all notifications?',
      onConfirm: async () => {
        try {
          const batch = writeBatch(db);
          notifications.forEach(n => batch.delete(doc(db, 'notifications', n.id)));
          await batch.commit();
        } catch (e) { handleFirestoreError(e, OperationType.DELETE, 'notifications'); }
      }
    });
  };

  const filteredBarbers = useMemo(() => userRole === 'worker' && workerId ? barbers.filter(b => b.id === workerId) : barbers, [barbers, userRole, workerId]);

  return (
    <div className={cn("min-h-screen bg-[#050505] text-white", isRtl ? 'rtl' : 'ltr')}>
      <header className="border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-50">
        <div className="bg-yellow-500/10 border-b border-yellow-500/10 py-2">
          <div className="max-w-7xl mx-auto px-4 flex items-center justify-center gap-4">
            {['Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (
              <button
                key={day}
                onClick={() => updateCurrentDay(day)}
                className={cn(
                  "px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all",
                  settings.currentDay === day 
                    ? "bg-yellow-500 text-black shadow-lg shadow-yellow-500/20" 
                    : "text-white/40 hover:text-white/60"
                )}
              >
                {day}
              </button>
            ))}
          </div>
          <div className="max-w-7xl mx-auto px-4 mt-1 flex items-center justify-center gap-2 text-[8px] text-white/30 uppercase tracking-[0.2em]">
            <Clock size={10} />
            {t.workingDays}
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative group">
              <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 overflow-hidden">
                {settings.logoUrl ? (
                  <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <Scissors size={24} />
                )}
              </div>
              {(userRole === 'admin' || userRole === 'manager') && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl gap-2">
                  <label className="cursor-pointer p-1 hover:text-blue-400 transition-colors">
                    <Upload size={16} />
                    <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                  </label>
                  {settings.logoUrl && (
                    <button onClick={deleteLogo} className="p-1 hover:text-red-400 transition-colors">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 to-yellow-200">{t.title}</h1>
              <p className="text-[10px] uppercase tracking-widest text-white/40">{t.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {['en', 'fr', 'ar'].map(l => (
              <button key={l} onClick={() => setLang(l as any)} className={cn("w-8 h-8 rounded-lg text-[10px] font-bold border", lang === l ? "bg-yellow-500 text-black" : "bg-white/5 text-white/60")}>{l.toUpperCase()}</button>
            ))}
            {userRole !== 'client' && (
              <div className="relative">
                <button 
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center border border-white/10 relative"
                >
                  <AlertCircle size={20} className={notifications.some(n => !n.read && (userRole !== 'worker' || n.barberId === workerId)) ? "text-yellow-500 animate-pulse" : "text-white/40"} />
                  {notifications.filter(n => !n.read && (userRole !== 'worker' || n.barberId === workerId)).length > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[8px] flex items-center justify-center font-bold">
                      {notifications.filter(n => !n.read && (userRole !== 'worker' || n.barberId === workerId)).length}
                    </span>
                  )}
                </button>
                <AnimatePresence>
                  {showNotifications && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }} 
                      animate={{ opacity: 1, y: 0 }} 
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute right-0 mt-2 w-72 bg-[#0a0a0a] border border-white/10 rounded-2xl p-4 shadow-2xl z-50 max-h-96 overflow-y-auto"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-white/40">{t.notifications}</h4>
                        {notifications.length > 0 && (
                          <button onClick={clearNotifications} className="text-[8px] font-bold uppercase text-red-400 hover:text-red-300">Clear All</button>
                        )}
                      </div>
                      <div className="space-y-2">
                        {notifications.filter(n => userRole !== 'worker' || n.barberId === workerId).length === 0 ? (
                          <p className="text-[10px] text-white/20 text-center py-4">No notifications</p>
                        ) : (
                          notifications.filter(n => userRole !== 'worker' || n.barberId === workerId).map(n => (
                            <div key={n.id} className={cn("p-3 rounded-xl border transition-colors", n.read ? "bg-white/5 border-white/5 opacity-50" : "bg-yellow-500/10 border-yellow-500/20")}>
                              <p className="text-[10px] font-medium mb-1">{n.message}</p>
                              {!n.read && (
                                <button onClick={() => markNotificationRead(n.id)} className="text-[8px] font-bold uppercase text-yellow-500">Mark as read</button>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
            {userRole === 'client' ? (
              <button onClick={() => setShowLogin(true)} className="px-4 py-2 bg-white/5 rounded-full border border-white/10 text-sm">{t.login}</button>
            ) : (
              <button onClick={() => { setUserRole('client'); setWorkerId(null); }} className="px-4 py-2 bg-red-500/10 text-red-400 rounded-full border border-red-500/20 text-sm">{t.logout}</button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-12">
        <div className="mb-12 p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center gap-4">
          <AlertCircle className="text-blue-400" size={20} />
          <p className="text-sm text-blue-100/80">{t.tenMinRule}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {filteredBarbers.map((barber) => (
            <div key={barber.id} className="bg-[#0a0a0a] border border-white/10 rounded-[2rem] p-8 relative hover:border-yellow-500/50 transition-all">
              <div className="absolute top-6 right-6">
                <div className={cn("px-3 py-1 rounded-full text-[10px] font-bold uppercase border flex items-center gap-2", barber.status === 'available' ? "text-emerald-400 border-emerald-500/20" : barber.status === 'working' ? "text-red-400 border-red-500/20" : "text-white/40 border-white/10")}>
                  <div className={cn("w-1.5 h-1.5 rounded-full", barber.status === 'available' ? "bg-emerald-400" : barber.status === 'working' ? "bg-red-400" : "bg-white/40")} />
                  {t[barber.status]}
                </div>
              </div>
              <div className="relative w-20 h-20 bg-white/5 rounded-2xl mb-6 flex items-center justify-center border border-white/10 overflow-hidden group/photo">
                {barber.photoUrl ? <img src={barber.photoUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <User className="text-white/20" size={32} />}
                {userRole === 'admin' && (
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/photo:opacity-100 flex items-center justify-center transition-opacity gap-2">
                    <label className="cursor-pointer p-1 hover:text-blue-400 transition-colors">
                      <Camera size={20} /><input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhoto(barber.id, e)} />
                    </label>
                    {barber.photoUrl && (
                      <button onClick={() => deleteBarberPhoto(barber.id)} className="p-1 hover:text-red-400 transition-colors">
                        <Trash2 size={20} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              <h3 className="text-xl font-bold mb-6">{barber.name}</h3>
              <div className="space-y-3 mb-8 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                {bookings
                  .filter(b => b.barberId === barber.id && (b.dayName === settings.currentDay || (!b.dayName && format(parseISO(b.date), 'EEEE') === settings.currentDay)))
                  .map((b, i) => {
                    const isToday = b.date === format(new Date(), 'yyyy-MM-dd');
                  return (
                    <div key={b.id} className={cn("flex items-center justify-between p-3 rounded-xl border transition-all", isToday ? "bg-blue-500/5 border-blue-500/20" : "bg-white/5 border-white/10")}>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-yellow-500/50">{i + 1}</span>
                        <div>
                          <p className="text-xs font-bold">{b.clientName}</p>
                          <p className="text-[10px] text-white/40">{b.time} <span className="ml-1 opacity-50">({b.date})</span></p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {b.status === 'completed' ? <CheckCircle2 size={14} className="text-emerald-400" /> : b.status === 'missed' ? <XCircle size={14} className="text-red-400" /> : (userRole !== 'client' && (userRole !== 'worker' || workerId === barber.id)) && (
                          <button onClick={() => completeBooking(b.id)} className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/40 transition-colors"><CheckCircle2 size={14} /></button>
                        )}
                        {userRole === 'admin' && (
                          <button onClick={() => deleteBooking(b.id)} className="p-1.5 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/40 transition-colors"><Trash2 size={14} /></button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {bookings.filter(b => b.barberId === barber.id).length === 0 && (
                  <p className="text-center py-4 text-[10px] text-white/20 uppercase tracking-widest">{t.noBookings}</p>
                )}
              </div>
              {userRole === 'client' && barber.status !== 'unavailable' && (
                <button onClick={() => setBookingModal({ barberId: barber.id })} className="w-full py-4 bg-blue-600 rounded-2xl font-bold text-sm shadow-lg shadow-blue-500/20">{t.bookNow}</button>
              )}
              {userRole !== 'client' && (userRole !== 'worker' || workerId === barber.id) && (
                <div className="grid grid-cols-3 gap-2">
                  {['available', 'working', 'unavailable'].map(s => (
                    <button key={s} onClick={() => updateStatus(barber.id, s as any)} className={cn("py-2 rounded-xl text-[10px] font-bold uppercase border", barber.status === s ? "bg-white/10 border-white/20" : "border-white/5 text-white/20")}>{t[s as keyof typeof t].slice(0, 3)}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </main>

      {(userRole === 'admin' || userRole === 'manager') && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
          <button onClick={clearDay} className="px-8 py-4 bg-red-600 text-white rounded-full font-bold shadow-2xl flex items-center gap-3"><Trash2 size={20} />{t.clearDay}</button>
        </div>
      )}

      <AnimatePresence>
        {confirmModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-[#0a0a0a] border border-white/10 p-8 rounded-[2rem] max-w-sm w-full text-center"
            >
              <AlertCircle className="mx-auto text-yellow-500 mb-4" size={48} />
              <p className="text-lg font-bold mb-6">{confirmModal.message}</p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setConfirmModal(null)}
                  className="flex-1 py-3 bg-white/5 rounded-xl font-bold border border-white/10"
                >
                  {t.cancel}
                </button>
                <button 
                  onClick={() => { confirmModal.onConfirm(); setConfirmModal(null); }}
                  className="flex-1 py-3 bg-red-600 rounded-xl font-bold"
                >
                  {t.confirm}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {alertModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-[#0a0a0a] border border-white/10 p-8 rounded-[2rem] max-w-sm w-full text-center"
            >
              <AlertCircle className="mx-auto text-blue-400 mb-4" size={48} />
              <p className="text-lg font-bold mb-6">{alertModal}</p>
              <button 
                onClick={() => setAlertModal(null)}
                className="w-full py-3 bg-blue-600 rounded-xl font-bold"
              >
                OK
              </button>
            </motion.div>
          </div>
        )}

        {showLogin && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={() => setShowLogin(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="relative w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] p-10">
              <h2 className="text-2xl font-bold text-center mb-8">{t.login}</h2>
              <form onSubmit={handleLogin} className="space-y-6">
                <input type="text" required value={loginForm.name} onChange={e => setLoginForm({...loginForm, name: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4" placeholder="Username" />
                <input type="password" required value={loginForm.password} onChange={e => setLoginForm({...loginForm, password: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4" placeholder="Password" />
                <button type="submit" className="w-full py-5 bg-blue-600 rounded-2xl font-bold">{t.login}</button>
              </form>
            </motion.div>
          </div>
        )}
        {bookingModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={() => setBookingModal(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="relative w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] p-10">
              <h2 className="text-2xl font-bold text-center mb-8">{t.bookNow}</h2>
              <div className="space-y-6">
                <input type="text" value={clientName} onChange={e => setClientName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4" placeholder={t.clientName} />
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest text-white/40 ml-2">{t.pickDate}</label>
                    <input type="date" value={bookingDate} onChange={e => setBookingDate(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest text-white/40 ml-2">{t.pickTime}</label>
                    <input type="time" value={bookingTime} onChange={e => setBookingTime(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm" />
                  </div>
                </div>
                <div className="flex gap-4">
                  <button onClick={() => setBookingModal(null)} className="flex-1 py-4 bg-white/5 rounded-2xl font-bold">{t.cancel}</button>
                  <button onClick={handleBooking} disabled={!clientName || !bookingTime} className="flex-[2] bg-yellow-500 text-black rounded-2xl font-bold disabled:opacity-50">{t.confirm}</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() { return <ErrorBoundary><BarberShop /></ErrorBoundary>; }
