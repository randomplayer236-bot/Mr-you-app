/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

console.log("App.tsx module loading...");

import React, { useState, useEffect, useMemo, Component } from 'react';
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
  Upload,
  Bell,
  X,
  Star,
  Droplets,
  Save,
  ExternalLink,
  Download
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  getDoc,
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  limit,
  addDoc, 
  getDocs,
  where,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from './firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, addMinutes, isAfter, parseISO } from 'date-fns';

if (typeof window !== 'undefined') {
  window.onerror = (msg, url, line, col, error) => {
    console.error("Global Error:", { msg, url, line, col, error });
    const root = document.getElementById('root');
    if (root && root.innerHTML === '') {
      root.innerHTML = `<div style="color: white; padding: 40px; background: black; height: 100vh; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
        <h1 style="color: #d4af37; font-size: 24px; margin-bottom: 10px;">MR YOU - System Error</h1>
        <p style="opacity: 0.6; margin-bottom: 20px;">We encountered a critical error during startup.</p>
        <div style="background: #111; padding: 20px; border-radius: 10px; overflow: auto; max-width: 80%; font-size: 12px; color: #ff4444; text-align: left; margin-bottom: 20px; border: 1px solid #333;">
          <code>${msg}</code>
        </div>
        <button onclick="window.location.reload()" style="background: #d4af37; color: black; border: none; padding: 12px 24px; border-radius: 10px; cursor: pointer; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Reload Application</button>
      </div>`;
    }
  };
}

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

// --- Types ---
type Role = 'admin' | 'manager' | 'worker' | 'client';
type Status = 'available' | 'working' | 'unavailable';
type BookingStatus = 'pending' | 'completed' | 'missed';

interface Barber { 
  id: string; 
  name: string; 
  status: Status; 
  photoUrl?: string; 
  order: number; 
  isShop?: boolean; 
  isKicked?: boolean; 
  activeSessionId?: string;
  lastActive?: any;
}
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
  isVip?: boolean;
  serviceType?: 'haircut' | 'hammam';
  bookedAt?: string;
  clientId?: string;
  isManagerBooking?: boolean;
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
    title: 'MR YOU', 
    subtitle: '', 
    available: 'Available', working: 'Working', unavailable: 'Unavailable',
    bookNow: 'Book Now', clientName: 'Your Name', pickTime: 'Pick Time', pickDate: 'Pick Date', confirm: 'Confirm Booking', cancel: 'Cancel',
    admin: 'Admin', manager: 'Manager', worker: 'Worker', login: 'Login', password: 'Password', clearDay: 'Clear Day',
    workingDays: 'Tuesday - Sunday (10:00 - 22:00)', tenMinRule: 'Note: Max 15 mins late or booking missed.',
    done: 'Done', delete: 'Delete', noBookings: 'No bookings', clientsBefore: 'Clients before you', logout: 'Logout',
    notifications: 'Notifications',
    liveSchedule: 'Live Schedule',
    allBookingsVisible: 'All bookings are public and visible to everyone.',
    newBooking: 'New booking from', at: 'at', ourHaircuts: 'Our Hair Cuts',
    days: { Tuesday: 'Tuesday', Wednesday: 'Wednesday', Thursday: 'Thursday', Friday: 'Friday', Saturday: 'Saturday', Sunday: 'Sunday' },
    choosePersonalBarber: 'Choose a personal barber',
    vipSection: 'VIP Section',
    vipBooking: 'VIP Booking',
    vipDetails: 'Proteins, Hair Dying, and more',
    hammam: 'Hammam',
    hammamDetails: 'Soaps, professional cleaning, towels',
    kick: 'Kick',
    unban: 'Unban',
    unbannedSection: 'Unbanned Section',
    kickedMessage: 'You have been kicked from the shop. Access denied.',
    barbers: 'Barbers',
    confirmCancel: 'Are you sure you want to cancel your booking?',
    cancelSuccess: 'Booking cancelled successfully.',
    cancelTimeLimit: 'You can only cancel at least 2 hours before the appointment.',
    installApp: 'Install App',
    installInstructions: 'Installation Instructions',
    iosInstall: 'On iPhone: Tap the Share button (square with arrow) and select "Add to Home Screen".',
    androidInstall: 'On Android: Tap the menu button (three dots) and select "Install app" or "Add to Home screen".',
    updateAvailable: 'Update Available',
    updateNow: 'Update Now',
    refreshing: 'Refreshing...'
  },
  fr: {
    title: 'MR YOU', 
    subtitle: '', 
    available: 'Disponible', working: 'En cours', unavailable: 'Indisponible',
    bookNow: 'Réserver', clientName: 'Votre Nom', pickTime: 'Choisir l\'heure', pickDate: 'Choisir la date', confirm: 'Confirmer', cancel: 'Annuler',
    admin: 'Admin', manager: 'Gérant', worker: 'Coiffeur', login: 'Connexion', password: 'Mot de passe', clearDay: 'Effacer',
    workingDays: 'Mardi - Dimanche (10:00 - 22:00)', tenMinRule: 'Note: Max 15 min de retard ou annulé.',
    done: 'Terminé', delete: 'Supprimer', noBookings: 'Aucune réservation', clientsBefore: 'Clients avant vous', logout: 'Déconnexion',
    notifications: 'Notifications',
    liveSchedule: 'Planning en direct',
    allBookingsVisible: 'Toutes les réservations sont publiques et visibles par tous.',
    newBooking: 'Nouvelle réservation de', at: 'à', ourHaircuts: 'Nos Coupes',
    days: { Tuesday: 'Mardi', Wednesday: 'Mercredi', Thursday: 'Jeudi', Friday: 'Vendredi', Saturday: 'Samedi', Sunday: 'Dimanche' },
    choosePersonalBarber: 'Choisir un coiffeur personnel',
    vipSection: 'Section VIP',
    vipBooking: 'Réservation VIP',
    vipDetails: 'Protéines, Teinture, et plus',
    hammam: 'Hammam',
    hammamDetails: 'Savons, nettoyage professionnel, serviettes et tout ce dont vous avez besoin.',
    kick: 'Renvoyer',
    unban: 'Réintégrer',
    unbannedSection: 'Section des bannis',
    kickedMessage: 'Vous avez été renvoyé du salon. Accès refusé.',
    barbers: 'Barbiers',
    confirmCancel: 'Êtes-vous sûr de vouloir annuler votre réservation ?',
    cancelSuccess: 'Réservation annulée avec succès.',
    cancelTimeLimit: 'Vous ne pouvez annuler qu\'au moins 2 heures avant le rendez-vous.',
    installApp: 'Installer l\'application',
    installInstructions: 'Instructions d\'installation',
    iosInstall: 'Sur iPhone : Appuyez sur le bouton Partager (carré avec flèche) et sélectionnez "Sur l\'écran d\'accueil".',
    androidInstall: 'Sur Android : Appuyez sur le bouton menu (trois points) et sélectionnez "Installer l\'application" ou "Ajouter à l\'écran d\'accueil".',
    updateAvailable: 'Mise à jour disponible',
    updateNow: 'Mettre à jour maintenant',
    refreshing: 'Actualisation...'
  },
  ar: {
    title: 'MR YOU', 
    subtitle: '', 
    available: 'متاح', working: 'يعمل', unavailable: 'غير متاح',
    bookNow: 'احجز الآن', clientName: 'اسمك', pickTime: 'اختر الوقت', pickDate: 'اختر التاريخ', confirm: 'تأكيد الحجز', cancel: 'إلغاء',
    admin: 'مسؤول', manager: 'مدير', worker: 'حلاق', login: 'تسجيل الدخول', password: 'كلمة المرور', clearDay: 'مسح اليوم',
    workingDays: 'الثلاثاء - الأحد (10:00 - 22:00)', tenMinRule: 'ملاحظة: 15 دقيقة كحد أقصى للوصول.',
    done: 'تم', delete: 'حذف', noBookings: 'لا يوجد حجوزات', clientsBefore: 'عملاء قبلك', logout: 'تسجيل الخروج',
    notifications: 'الإشعارات',
    liveSchedule: 'الجدول المباشر',
    allBookingsVisible: 'جميع الحجوزات عامة ومرئية للجميع.',
    newBooking: 'حجز جديد من', at: 'في', ourHaircuts: 'قصاتنا',
    days: { Tuesday: 'الثلاثاء', Wednesday: 'الأربعاء', Thursday: 'الخميس', Friday: 'الجمعة', Saturday: 'السبت', Sunday: 'الأحد' },
    choosePersonalBarber: 'اختر حلاقك الشخصي',
    vipSection: 'قسم VIP',
    vipBooking: 'حجز VIP',
    vipDetails: 'بروتينات، صبغة شعر، والمزيد',
    hammam: 'حمام',
    hammamDetails: 'صابون، تنظيف احترافي، مناشف وكل ما تحتاجه.',
    kick: 'طرد',
    unban: 'إلغاء الحظر',
    unbannedSection: 'قسم المحظورين',
    kickedMessage: 'لقد تم طردك من المحل. تم رفض الوصول.',
    barbers: 'الحلاقين',
    confirmCancel: 'هل أنت متأكد أنك تريد إلغاء حجزك؟',
    cancelSuccess: 'تم إلغاء الحجز بنجاح.',
    cancelTimeLimit: 'يمكنك الإلغاء قبل ساعتين على الأقل من الموعد.',
    installApp: 'تثبيت التطبيق',
    installInstructions: 'تعليمات التثبيت',
    iosInstall: 'على iPhone: اضغط على زر المشاركة (مربع بسهم) واختر "إضافة إلى الشاشة الرئيسية".',
    androidInstall: 'على Android: اضغط على زر القائمة (ثلاث نقاط) واختر "تثبيت التطبيق" أو "إضافة إلى الشاشة الرئيسية".',
    updateAvailable: 'تحديث متاح',
    updateNow: 'تحديث الآن',
    refreshing: 'جاري التحديث...'
  }
};

const InAppBrowserBanner = () => (
  <motion.div
    initial={{ y: -100 }}
    animate={{ y: 0 }}
    className="fixed top-0 left-0 right-0 z-[100] bg-gold-500 text-black p-4 shadow-2xl flex items-center justify-between"
  >
    <div className="flex items-center gap-3">
      <div className="bg-black/20 p-2 rounded-lg">
        <ExternalLink size={20} />
      </div>
      <div>
        <p className="font-black text-xs uppercase tracking-tight">Open in External Browser</p>
        <p className="text-[10px] font-medium opacity-80">Instagram/Facebook browsers don't support direct installation.</p>
      </div>
    </div>
    <div className="flex items-center gap-2">
      <div className="text-[10px] font-bold bg-black/10 px-2 py-1 rounded border border-black/10">
        Tap ... or Share → Open in Browser
      </div>
    </div>
  </motion.div>
);

const PWAInstallPrompt = ({ lang, t }: { lang: string, t: any }) => {
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);
    
    if (!isStandalone) {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  return (
    <motion.div
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      className="fixed bottom-4 left-4 right-4 z-[100] bg-black/90 backdrop-blur-xl border border-gold-500/20 p-4 rounded-2xl shadow-2xl"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <Download className="text-gold-500" size={20} />
          <p className="text-xs font-black uppercase tracking-widest text-gold-500">{t.installApp}</p>
        </div>
        <button onClick={() => setShow(false)} className="text-white/40 hover:text-white">
          <X size={16} />
        </button>
      </div>
      <p className="text-[10px] text-white/70 leading-relaxed">
        {isIOS ? t.iosInstall : t.androidInstall}
      </p>
    </motion.div>
  );
};

const UpdatePrompt = ({ t }: { t: any }) => {
  const [show, setShow] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg) {
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  setWaitingWorker(newWorker);
                  setShow(true);
                }
              });
            }
          });
        }
      });
    }
  }, []);

  const updateApp = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      setShow(false);
      window.location.reload();
    }
  };

  if (!show) return null;

  return (
    <motion.div
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className="fixed top-20 left-4 right-4 z-[100] bg-gold-500 text-black p-4 rounded-xl shadow-2xl flex items-center justify-between"
    >
      <div className="flex items-center gap-3">
        <Bell size={20} className="animate-bounce" />
        <p className="text-xs font-black uppercase tracking-widest">{t.updateAvailable}</p>
      </div>
      <button
        onClick={updateApp}
        className="px-4 py-2 bg-black text-gold-500 rounded-lg text-[10px] font-black uppercase tracking-widest"
      >
        {t.updateNow}
      </button>
    </motion.div>
  );
};

const DigitalClock = ({ offset = 0 }: { offset?: number }) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const adjustedTime = new Date(time.getTime() + offset * 60000);

  const formattedTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Casablanca',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(adjustedTime);

  return (
    <div className="flex flex-col items-center justify-center bg-black/40 backdrop-blur-md border border-gold-500/20 rounded-2xl p-4 shadow-xl">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold-500/60 mb-1">Salé El Jadida Time</p>
      <p className="text-3xl font-mono font-black text-gold-500 tracking-wider drop-shadow-[0_0_100px_rgba(212,175,55,0.3)]">
        {formattedTime}
      </p>
    </div>
  );
};

function BarberShop() {
  const [lang, setLang] = useState<'en' | 'fr' | 'ar'>('fr');
  const [userRole, setUserRole] = useState<Role>('client');
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [clientId] = useState(() => {
    let id = localStorage.getItem('barber_client_id');
    if (!id) {
      id = 'c_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('barber_client_id', id);
    }
    return id;
  });
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [viewDay, setViewDay] = useState<string>('Tuesday');
  const [settings, setSettings] = useState({ 
    currentDay: 'Tuesday', 
    logoUrl: '', 
    vipPhotoUrl: '',
    lastCleanupDate: '',
    timeOffset: 0
  });
  const [stagedImages, setStagedImages] = useState<{ id: string, data: string, storagePath?: string, type: 'file' | 'url', folder: string, name: string }[]>([]);

  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const stageImage = async (file: File | string, folder: string) => {
    if (typeof file === 'string') {
      // URL input
      setStagedImages(prev => [...prev, { 
        id: Math.random().toString(36).substr(2, 9), 
        data: file, 
        type: 'url', 
        folder,
        name: 'Remote URL'
      }]);
    } else {
      // File input
      if (file.size > 800 * 1024) {
        setAlertModal('File too large! Please keep images under 800KB for Firestore storage.');
        return;
      }
      try {
        const base64 = await convertToBase64(file);
        setStagedImages(prev => [...prev, { 
          id: Math.random().toString(36).substr(2, 9), 
          data: base64, 
          type: 'file', 
          folder,
          name: file.name
        }]);
      } catch (err) {
        setAlertModal('Failed to convert image to Base64');
      }
    }
  };

  const saveAllStaged = async () => {
    if (stagedImages.length === 0) return;
    setAlertModal('Saving all staged images...');
    try {
      const batch = writeBatch(db);
      
      for (const img of stagedImages) {
        if (img.folder === 'logos') {
          batch.update(doc(db, 'settings', 'global'), { logoUrl: img.data });
        } else if (img.folder === 'vip_photos') {
          batch.update(doc(db, 'settings', 'global'), { vipPhotoUrl: img.data });
        } else if (img.folder.startsWith('barber_photos_')) {
          const id = img.folder.split('_').pop() || '';
          batch.update(doc(db, 'barbers', id), { photoUrl: img.data });
        }
      }
      
      await batch.commit();
      setStagedImages([]);
      setAlertModal('All images saved successfully!');
    } catch (err) {
      console.error(err);
      setAlertModal('Failed to save staged images');
    }
  };

  const removeStaged = async (id: string) => {
    const img = stagedImages.find(i => i.id === id);
    if (img?.storagePath) {
      await fetch('/server-api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath: img.storagePath }),
      }).catch(e => console.error('Storage delete failed:', e));
    }
    setStagedImages(prev => prev.filter(img => img.id !== id));
  };

  const [sessionId] = useState(() => Math.random().toString(36).substring(7));
  const [showWorkers, setShowWorkers] = useState(false);
  const [showPersonalBarbers, setShowPersonalBarbers] = useState(false);
  const [isVipBooking, setIsVipBooking] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [loginForm, setLoginForm] = useState({ name: '', password: '' });
  const [bookingModal, setBookingModal] = useState<{ barberId: string; serviceType?: 'haircut' | 'hammam' } | null>(null);

  useEffect(() => {
    if (!bookingModal) {
      setIsVipBooking(false);
      setClientName('');
      setBookingTime('');
    }
  }, [bookingModal]);
  const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [alertModal, setAlertModal] = useState<string | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);
  const [clientName, setClientName] = useState('');
  const [bookingTime, setBookingTime] = useState('');
  const [bookingDate, setBookingDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            setUserRole(data.role || 'client');
            setWorkerId(data.barberId || null);
          } else {
            setUserRole('client');
            setWorkerId(null);
          }
        } catch (e) {
          console.error("Auth user doc fetch failed:", e);
          setUserRole('client');
        }
      } else {
        setUserRole('client');
        setWorkerId(null);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const qB = query(collection(db, 'barbers'), orderBy('order'));
    const unsubB = onSnapshot(qB, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Barber));
      
      // Ensure exactly 8 barbers + 1 shop entry
      const shop = data.find(b => b.isShop);
      const workers = data.filter(b => !b.isShop).sort((a, b) => a.order - b.order);

      if (data.length === 0) {
        const batch = writeBatch(db);
        batch.set(doc(collection(db, 'barbers')), { name: 'MR you', status: 'available', order: 0, isShop: true });
        for (let i = 1; i <= 8; i++) {
          batch.set(doc(collection(db, 'barbers')), { name: `Barber n.o${i}`, status: 'unavailable', order: i });
        }
        batch.commit().catch(e => handleFirestoreError(e, OperationType.WRITE, 'barbers'));
      } else {
        // If shop missing, add it
        if (!shop) {
          addDoc(collection(db, 'barbers'), { name: 'MR you', status: 'available', order: 0, isShop: true })
            .catch(e => handleFirestoreError(e, OperationType.WRITE, 'barbers'));
        }

        // If not exactly 8 workers, or orders are wrong, fix it
        const hasCorrectWorkers = workers.length === 8 && workers.every((w, i) => w.order === i + 1);
        if (!hasCorrectWorkers && data.length > 0) {
          const batch = writeBatch(db);
          
          // Identify which orders are missing
          const existingOrders = new Set(workers.map(w => w.order));
          for (let i = 1; i <= 8; i++) {
            if (!existingOrders.has(i)) {
              batch.set(doc(collection(db, 'barbers')), { name: `Barber n.o${i}`, status: 'unavailable', order: i });
            }
          }
          
          // Remove duplicates or extras
          const seenOrders = new Set();
          workers.forEach(w => {
            if (w.order < 1 || w.order > 8 || seenOrders.has(w.order)) {
              batch.delete(doc(db, 'barbers', w.id));
            } else {
              seenOrders.add(w.order);
            }
          });
          
          batch.commit().catch(e => handleFirestoreError(e, OperationType.WRITE, 'barbers'));
        }
      }
      setBarbers(data);
    }, (e) => handleFirestoreError(e, OperationType.GET, 'barbers'));

    const qBk = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'), limit(1000));
    const unsubBk = onSnapshot(qBk, (snap) => {
      setBookings(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking)).reverse());
    }, (e) => handleFirestoreError(e, OperationType.GET, 'bookings'));

    const qN = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(30));
    const unsubN = onSnapshot(qN, (snap) => {
      setNotifications(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification)));
    }, (e) => handleFirestoreError(e, OperationType.GET, 'notifications'));

    const unsubS = onSnapshot(doc(db, 'settings', 'global'), (snap) => {
      const defaultLogo = 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=400&h=400&fit=crop&q=80';

      if (snap.exists()) {
        const data = snap.data();
        const currentDay = data.currentDay || 'Tuesday';
        setSettings({
          currentDay: currentDay,
          logoUrl: data.logoUrl || defaultLogo,
          vipPhotoUrl: data.vipPhotoUrl || 'https://images.unsplash.com/photo-1512690196252-741d2fd36ad0?w=800&q=80',
          lastCleanupDate: data.lastCleanupDate || '',
          timeOffset: data.timeOffset || 0
        });
        setViewDay(currentDay);
        
        const currentLogo = data.logoUrl || defaultLogo;
        
        const link = document.querySelector("link[rel~='icon']") || document.createElement('link');
        (link as HTMLLinkElement).rel = 'icon';
        (link as HTMLLinkElement).href = currentLogo;
        document.getElementsByTagName('head')[0].appendChild(link);

        const appleIcon = document.getElementById('apple-icon');
        if (appleIcon) appleIcon.setAttribute('href', currentLogo);
      } else {
        setDoc(doc(db, 'settings', 'global'), { 
          currentDay: 'Tuesday', 
          logoUrl: '', 
          lastCleanupDate: '',
          timeOffset: 0
        })
          .catch(e => handleFirestoreError(e, OperationType.WRITE, 'settings/global'));
      }
    }, (e) => handleFirestoreError(e, OperationType.GET, 'settings/global'));

    return () => { unsubB(); unsubBk(); unsubN(); unsubS(); };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date(new Date().getTime() + (settings.timeOffset || 0) * 60000);
      bookings.forEach(async (b) => {
        if (b.status === 'pending') {
          try {
            const bTime = parseISO(`${b.date}T${b.time}`);
            if (isAfter(now, addMinutes(bTime, 15))) {
              await updateDoc(doc(db, 'bookings', b.id), { status: 'missed' })
                .catch(e => handleFirestoreError(e, OperationType.UPDATE, `bookings/${b.id}`));
            }
          } catch (e) {}
        }
      });
    }, 60000);
    return () => clearInterval(interval);
  }, [bookings]);

  useEffect(() => {
    if (userRole === 'worker' && workerId) {
      const worker = barbers.find(b => b.id === workerId);
      if (worker?.isKicked) {
        setUserRole('client');
        setWorkerId(null);
        setAlertModal(t.kickedMessage);
        return;
      }
      
      // Session check removed as per user request
    }
  }, [barbers, userRole, workerId, sessionId, t.kickedMessage]);

  useEffect(() => {
    // Check if already installed
    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    setIsStandalone(!!isStandaloneMode);

    // Check if iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    // Check for In-App Browsers (Instagram, Facebook, etc.)
    const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
    const isInsideApp = (ua.indexOf('FBAN') > -1) || (ua.indexOf('FBAV') > -1) || (ua.indexOf('Instagram') > -1) || (ua.indexOf('Threads') > -1);
    setIsInAppBrowser(isInsideApp);

    const handleBeforeInstallPrompt = (e: any) => {
      console.log('beforeinstallprompt event fired');
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallButton(true);
    };

    const handleAppInstalled = () => {
      console.log('App was installed');
      setDeferredPrompt(null);
      setShowInstallButton(false);
      setIsStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to install prompt: ${outcome}`);
      
      setDeferredPrompt(null);
      setShowInstallButton(false);
    } catch (err) {
      console.error('Install prompt failed:', err);
    }
  };

  // Heartbeat for workers
  useEffect(() => {
    if (userRole === 'worker' && workerId) {
      const interval = setInterval(async () => {
        try {
          await updateDoc(doc(db, 'barbers', workerId), { 
            lastActive: serverTimestamp()
          });
        } catch (e) {}
      }, 15000);
      return () => clearInterval(interval);
    }
  }, [userRole, workerId, sessionId]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const { name, password } = loginForm;
    if (name === 'sam' && password === 'sam2006') { setUserRole('admin'); setShowLogin(false); }
    else if (name === 'manager' && password === 'manager1234') { setUserRole('manager'); setShowLogin(false); }
    else if (password.startsWith('worker')) {
      const num = parseInt(password.replace('worker', ''));
      if (num >= 1 && num <= 8) {
        const barber = barbers.find(b => b.order === num);
        // Allow login with 'worker' or the barber's specific name
        if (barber && (name === 'worker' || name === barber.name)) {
          if (barber.isKicked) {
            setAlertModal(t.kickedMessage);
            return;
          }

          try {
            await updateDoc(doc(db, 'barbers', barber.id), { 
              lastActive: serverTimestamp()
            });
            setUserRole('worker');
            setWorkerId(barber.id);
            setShowLogin(false);
          } catch (e) {
            handleFirestoreError(e, OperationType.UPDATE, `barbers/${barber.id}`);
          }
        } else {
          setAlertModal('Invalid credentials');
        }
      } else {
        setAlertModal('Invalid credentials');
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
      
      const nowWithOffset = new Date(new Date().getTime() + (settings.timeOffset || 0) * 60000);
      const bookedAtTime = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Casablanca',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(nowWithOffset);

      const bookingRef = await addDoc(collection(db, 'bookings'), {
        barberId: bookingModal.barberId, 
        clientName, 
        date: bookingDate,
        time: bookingTime, 
        dayName,
        status: 'pending', 
        createdAt: serverTimestamp(),
        bookedAt: bookedAtTime,
        isVip: isVipBooking,
        serviceType: bookingModal.serviceType || 'haircut',
        clientId: clientId,
        isManagerBooking: userRole === 'manager' || userRole === 'admin'
      });
      
      // Create notification
      await addDoc(collection(db, 'notifications'), {
        barberId: bookingModal.barberId,
        message: `${isVipBooking ? '[VIP] ' : ''}${bookingModal.serviceType === 'hammam' ? '[HAMMAM] ' : ''}${t.newBooking} ${clientName} ${t.at} ${bookingTime} (${dayName} ${bookingDate})`,
        createdAt: serverTimestamp(),
        read: false
      });

      setBookingModal(null); setClientName(''); setBookingTime(''); setIsVipBooking(false);
      setViewDay(dayName);
    } catch (e) { handleFirestoreError(e, OperationType.CREATE, 'bookings'); }
  };

  const markNotificationRead = async (id: string) => {
    try { await updateDoc(doc(db, 'notifications', id), { read: true }); }
    catch (e) { handleFirestoreError(e, OperationType.UPDATE, `notifications/${id}`); }
  };

  const clearAllBookings = async () => {
    setConfirmModal({
      message: `Are you sure you want to delete ALL bookings from the database? This cannot be undone.`,
      onConfirm: async () => {
        try {
          if (bookings.length === 0) {
            setAlertModal(`No bookings found to clear.`);
            return;
          }

          let batch = writeBatch(db);
          let count = 0;
          
          for (const b of bookings) {
            batch.delete(doc(db, 'bookings', b.id));
            count++;
            if (count === 500) {
              await batch.commit();
              batch = writeBatch(db);
              count = 0;
            }
          }
          
          if (count > 0) await batch.commit();

          setAlertModal(`All ${bookings.length} bookings have been wiped out.`);
        } catch (e) { 
          console.error("Error clearing all bookings:", e);
          handleFirestoreError(e, OperationType.DELETE, 'bookings'); 
        }
      }
    });
  };

  const clearDay = async () => {
    setConfirmModal({
      message: `Are you sure you want to clear all bookings for ${viewDay}?`,
      onConfirm: async () => {
        try {
          // Filter the local bookings array to find exactly what's on the screen
          const bookingsToDelete = bookings.filter(b => 
            b.dayName === viewDay || 
            (!b.dayName && b.date && format(parseISO(b.date), 'EEEE') === viewDay)
          );

          if (bookingsToDelete.length === 0) {
            setAlertModal(`No bookings found for ${viewDay}.`);
            return;
          }

          let batch = writeBatch(db);
          let count = 0;
          
          for (const b of bookingsToDelete) {
            batch.delete(doc(db, 'bookings', b.id));
            count++;
            if (count === 500) {
              await batch.commit();
              batch = writeBatch(db);
              count = 0;
            }
          }
          
          if (count > 0) await batch.commit();

          setAlertModal(`All ${bookingsToDelete.length} bookings for ${viewDay} cleared successfully.`);
        } catch (e) { 
          console.error("Error clearing day:", e);
          handleFirestoreError(e, OperationType.DELETE, 'bookings'); 
        }
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

    if (file.size > 800 * 1024) {
      setAlertModal('File too large! Please keep images under 800KB.');
      return;
    }
    
    stageImage(file, 'logos');
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

  const handleVipPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 800 * 1024) {
      setAlertModal('File too large! Please keep images under 800KB.');
      return;
    }

    stageImage(file, 'vip_photos');
  };

  const deleteVipPhoto = async () => {
    setConfirmModal({
      message: 'Delete VIP section photo?',
      onConfirm: async () => {
        try {
          await updateDoc(doc(db, 'settings', 'global'), { vipPhotoUrl: '' });
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

    if (file.size > 800 * 1024) {
      setAlertModal('File too large! Please keep images under 800KB.');
      return;
    }

    stageImage(file, `barber_photos_${id}`);
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

  const markAsMissed = async (id: string) => {
    try { await updateDoc(doc(db, 'bookings', id), { status: 'missed' }); }
    catch (e) { handleFirestoreError(e, OperationType.UPDATE, `bookings/${id}`); }
  };

  const cancelBooking = async (bookingId: string) => {
    const booking = bookings.find(b => b.id === bookingId);
    if (!booking) return;

    const now = new Date();
    const bookingTime = parseISO(`${booking.date}T${booking.time}`);
    
    // Check if it's at least 2 hours before
    if (isAfter(now, addMinutes(bookingTime, -120))) {
      setAlertModal(t.cancelTimeLimit);
      return;
    }

    setConfirmModal({
      message: t.confirmCancel,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'bookings', bookingId));
          setAlertModal(t.cancelSuccess);
        } catch (e) {
          handleFirestoreError(e, OperationType.DELETE, `bookings/${bookingId}`);
        }
      }
    });
  };

  useEffect(() => {
    const DAYS_ORDER = ['Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    
    const cleanupInterval = setInterval(async () => {
      const now = new Date(new Date().getTime() + (settings.timeOffset || 0) * 60000);
      const currentHour = now.getHours();
      const todayStr = format(now, 'yyyy-MM-dd');

      // 1. If it's after 22:00 and we haven't cleaned up today's bookings yet
      const shouldCleanupClosing = currentHour >= 22 && settings.lastCleanupDate !== todayStr;
      
      // 2. If the app is opened on a new day and the last cleanup was from a previous day
      const isNewDay = settings.lastCleanupDate && settings.lastCleanupDate < todayStr;

      if (shouldCleanupClosing || isNewDay) {
        console.log('Starting cleanup process...');
        
        try {
          // If we are cleaning up at closing, delete everything up to today
          // If we are cleaning up because it's a new day, delete everything before today
          const cleanupDateLimit = shouldCleanupClosing ? todayStr : format(new Date(now.getTime() - 86400000), 'yyyy-MM-dd');
          
          const q = query(collection(db, 'bookings'), where('date', '<=', cleanupDateLimit));
          const snap = await getDocs(q);
          
          if (snap.docs.length > 0) {
            let batch = writeBatch(db);
            let count = 0;
            for (const docSnap of snap.docs) {
              batch.delete(docSnap.ref);
              count++;
              if (count === 500) {
                await batch.commit();
                batch = writeBatch(db);
                count = 0;
              }
            }
            if (count > 0) await batch.commit();
          }
          
          // Determine the correct current day based on the clock
          const dayName = format(now, 'EEEE');
          const nextDay = shouldCleanupClosing ? DAYS_ORDER[(DAYS_ORDER.indexOf(dayName) + 1) % DAYS_ORDER.length] : dayName;

          await updateDoc(doc(db, 'settings', 'global'), {
            currentDay: nextDay,
            lastCleanupDate: todayStr
          });
          
          console.log(`Cleanup complete. Current day set to ${nextDay}.`);
        } catch (e) {
          console.error('Cleanup failed:', e);
          handleFirestoreError(e, OperationType.DELETE, 'bookings');
        }
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(cleanupInterval);
  }, [settings.currentDay, settings.lastCleanupDate, settings.timeOffset, bookings]);

  const deleteBooking = async (id: string) => {
    setConfirmModal({
      message: 'Delete this booking?',
      onConfirm: async () => {
        try { await deleteDoc(doc(db, 'bookings', id)); }
        catch (e) { handleFirestoreError(e, OperationType.DELETE, `bookings/${id}`); }
      }
    });
  };

  const kickBarber = async (id: string) => {
    setConfirmModal({
      message: 'Are you sure you want to kick this barber? They will lose access to the app.',
      onConfirm: async () => {
        try { await updateDoc(doc(db, 'barbers', id), { isKicked: true }); }
        catch (e) { handleFirestoreError(e, OperationType.UPDATE, `barbers/${id}`); }
      }
    });
  };

  const unbanBarber = async (id: string) => {
    try { await updateDoc(doc(db, 'barbers', id), { isKicked: false }); }
    catch (e) { handleFirestoreError(e, OperationType.UPDATE, `barbers/${id}`); }
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

  const updateTimeOffset = async (offset: number) => {
    if (userRole !== 'admin' && userRole !== 'manager') return;
    try {
      await updateDoc(doc(db, 'settings', 'global'), { timeOffset: offset });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'settings/global'); }
  };

  const filteredBarbers = useMemo(() => {
    let list = barbers;
    if (userRole === 'worker' && workerId) {
      list = barbers.filter(b => b.id === workerId);
    }
    return list;
  }, [barbers, userRole, workerId]);

  const shopMain = useMemo(() => barbers.find(b => b.isShop), [barbers]);
  const workers = useMemo(() => {
    const filtered = barbers.filter(b => !b.isShop);
    if (userRole === 'worker' && workerId) {
      return filtered.filter(b => b.id === workerId);
    }
    return filtered;
  }, [barbers, userRole, workerId]);

  const visibleNotifications = useMemo(() => {
    return notifications.filter(n => {
      if (!shopMain) {
        if (userRole === 'admin' || userRole === 'manager') return true;
        if (userRole === 'worker') return n.barberId === workerId;
        return false;
      }
      
      const isShop = n.barberId === shopMain.id;
      if (isShop) {
        return userRole === 'manager' || userRole === 'admin';
      }
      if (userRole === 'worker') {
        return n.barberId === workerId;
      }
      return userRole === 'admin' || userRole === 'manager';
    });
  }, [notifications, userRole, workerId, shopMain]);

  return (
    <div className={`min-h-screen bg-black text-white selection:bg-gold-500/30 selection:text-gold-200 ${isRtl ? 'rtl' : 'ltr'}`}>
      <PWAInstallPrompt lang={lang} t={t} />
      <UpdatePrompt t={t} />
      <header className="border-b border-gold-500/10 bg-black/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="bg-gradient-to-r from-gold-950/40 via-black to-gold-950/40 border-b border-gold-500/10 py-3 overflow-x-auto custom-scrollbar">
          <div className="max-w-7xl mx-auto px-4 flex items-center justify-center gap-3 min-w-max">
            {['Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => {
              const isToday = format(new Date(), 'EEEE') === day;
              return (
                <motion.button
                  key={day}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setViewDay(day);
                    if (userRole === 'admin' || userRole === 'manager') {
                      updateCurrentDay(day);
                    }
                  }}
                  className={cn(
                    "px-5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all relative",
                    viewDay === day 
                      ? "bg-gold-500 text-black shadow-lg shadow-gold-500/40" 
                      : "text-white/40 hover:text-white/60 bg-white/5"
                  )}
                >
                  {(t as any).days[day]}
                  {isToday && (
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full border border-black shadow-sm" />
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 h-24 flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-5">
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="relative group shrink-0"
            >
              <div className="w-10 h-10 sm:w-14 sm:h-14 bg-gradient-to-br from-gold-400 to-gold-600 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-2xl shadow-gold-500/30 overflow-hidden border border-gold-300/30">
                {settings.logoUrl ? (
                  <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <>
                    <Scissors size={20} className="text-black sm:hidden" />
                    <Scissors size={28} className="text-black hidden sm:block" />
                  </>
                )}
              </div>
              {(userRole === 'admin' || userRole === 'manager') && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl sm:rounded-2xl gap-1 sm:gap-2">
                  <label className="cursor-pointer p-1 hover:text-gold-400 transition-colors">
                    <Upload size={14} className="sm:hidden" />
                    <Upload size={18} className="hidden sm:block" />
                    <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                  </label>
                  {settings.logoUrl && (
                    <button onClick={deleteLogo} className="p-1 hover:text-red-400 transition-colors">
                      <Trash2 size={14} className="sm:hidden" />
                      <Trash2 size={18} className="hidden sm:block" />
                    </button>
                  )}
                </div>
              )}
            </motion.div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-serif italic tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-gold-200 via-gold-400 to-gold-200 leading-none mb-0.5 sm:mb-1 truncate">{t.title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1 sm:gap-1.5">
              {['en', 'fr', 'ar'].map(l => (
                <motion.button 
                  key={l} 
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setLang(l as any)} 
                  className={cn("w-8 h-8 sm:w-9 sm:h-9 rounded-xl text-[9px] sm:text-[10px] font-black border transition-all", lang === l ? "bg-gold-500 text-black border-gold-500 shadow-lg shadow-gold-500/20" : "bg-white/5 text-white/60 border-white/10 hover:border-gold-500/30")}
                >
                  {l.toUpperCase()}
                </motion.button>
              ))}
            </div>
            {userRole !== 'client' && (
              <div className="relative">
                <motion.button 
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center border border-white/10 relative hover:border-gold-500/30 transition-all"
                >
                  <AlertCircle size={20} className={visibleNotifications.some(n => !n.read) ? "text-gold-500 animate-pulse" : "text-white/40"} />
                  {visibleNotifications.filter(n => !n.read).length > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full text-[8px] flex items-center justify-center font-bold">
                      {visibleNotifications.filter(n => !n.read).length}
                    </span>
                  )}
                </motion.button>
                <AnimatePresence>
                  {showNotifications && (
                    <motion.div 
                      key="notifications-dropdown"
                      initial={{ opacity: 0, y: 10, scale: 0.95 }} 
                      animate={{ opacity: 1, y: 0, scale: 1 }} 
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-72 bg-black border border-gold-500/20 rounded-2xl p-4 shadow-2xl z-50 max-h-96 overflow-y-auto"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-xs font-black uppercase tracking-widest text-gold-500/40">{t.notifications}</h4>
                        {visibleNotifications.length > 0 && (
                          <button onClick={clearNotifications} className="text-[8px] font-bold uppercase text-red-400 hover:text-red-300">Clear All</button>
                        )}
                      </div>
                      <div className="space-y-2">
                        {visibleNotifications.length === 0 ? (
                          <p className="text-[10px] text-white/20 text-center py-4">No notifications</p>
                        ) : (
                          visibleNotifications.map(n => (
                            <div key={n.id} className={cn("p-3 rounded-xl border transition-colors", n.read ? "bg-white/5 border-white/5 opacity-50" : "bg-gold-500/10 border-gold-500/20")}>
                              <p className="text-[10px] font-medium mb-1">{n.message}</p>
                              {!n.read && (
                                <button onClick={() => markNotificationRead(n.id)} className="text-[8px] font-black uppercase text-gold-500">Mark as read</button>
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
            {userRole !== 'client' && (
              <div className="w-8" /> // Spacer for notifications
            )}
          </div>
        </div>
      </header>
      {isInAppBrowser && <InAppBrowserBanner />}

      <AnimatePresence>
        {showInstallButton && deferredPrompt && !isStandalone && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-24 left-4 right-4 z-[100]"
          >
            <div className="bg-gold-500 rounded-2xl p-5 shadow-2xl shadow-gold-500/40 border-2 border-white/30 relative overflow-hidden group">
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <Download size={24} className="text-gold-500" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-black uppercase tracking-tighter leading-none mb-1">
                      Install App
                    </p>
                    <p className="text-[10px] text-black/70 font-bold uppercase tracking-widest">
                      One-click install for better experience
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleInstallClick}
                  className="px-6 py-3 bg-black text-gold-500 rounded-xl text-xs font-black uppercase tracking-widest active:scale-95 transition-all shadow-xl hover:shadow-black/20"
                >
                  Install App
                </button>
              </div>
              
              <button 
                onClick={() => setShowInstallButton(false)}
                className="absolute top-2 right-2 w-6 h-6 bg-black/10 text-black/40 hover:text-black rounded-full flex items-center justify-center transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:py-12">
        {isIOS && !isStandalone && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-black/40 backdrop-blur-md border border-gold-500/20 rounded-3xl p-6 mb-12 overflow-hidden relative group"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Download size={80} className="text-gold-500" />
            </div>
            
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-gold-500 rounded-xl flex items-center justify-center shadow-lg shadow-gold-500/20">
                  <Download size={20} className="text-black" />
                </div>
                <h3 className="text-lg font-black uppercase tracking-widest text-gold-500">Install MR You</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* English */}
                <div className="space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-500/40">English</p>
                  <div className="space-y-2">
                    <div className="flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold shrink-0">1</span>
                      <p className="text-xs text-white/70">Open this app in <span className="text-white font-bold">Safari</span> browser</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold shrink-0">2</span>
                      <p className="text-xs text-white/70">Tap the <span className="text-white font-bold">Share</span> button (square with arrow)</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold shrink-0">3</span>
                      <p className="text-xs text-white/70">Select <span className="text-white font-bold">"Add to Home Screen"</span></p>
                    </div>
                  </div>
                </div>

                {/* French */}
                <div className="space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-500/40">Français</p>
                  <div className="space-y-2">
                    <div className="flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold shrink-0">1</span>
                      <p className="text-xs text-white/70">Ouvrez cette application dans <span className="text-white font-bold">Safari</span></p>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold shrink-0">2</span>
                      <p className="text-xs text-white/70">Appuyez sur le bouton <span className="text-white font-bold">Partager</span> (carré avec flèche)</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold shrink-0">3</span>
                      <p className="text-xs text-white/70">Sélectionnez <span className="text-white font-bold">"Sur l'écran d'accueil"</span></p>
                    </div>
                  </div>
                </div>

                {/* Arabic */}
                <div className="space-y-3 text-right" dir="rtl">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-500/40">العربية</p>
                  <div className="space-y-2">
                    <div className="flex items-start gap-3 flex-row-reverse">
                      <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold shrink-0">١</span>
                      <p className="text-xs text-white/70">افتح هذا التطبيق في متصفح <span className="text-white font-bold">Safari</span></p>
                    </div>
                    <div className="flex items-start gap-3 flex-row-reverse">
                      <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold shrink-0">٢</span>
                      <p className="text-xs text-white/70">اضغط على زر <span className="text-white font-bold">المشاركة</span> (المربع مع السهم)</p>
                    </div>
                    <div className="flex items-start gap-3 flex-row-reverse">
                      <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold shrink-0">٣</span>
                      <p className="text-xs text-white/70">اختر <span className="text-white font-bold">"إضافة إلى الشاشة الرئيسية"</span></p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Hero Section */}
        <motion.section 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative h-[45vh] sm:h-[60vh] rounded-[3rem] overflow-hidden mb-16 border border-gold-500/20 shadow-2xl group"
        >
          <img 
            src="https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&q=80&w=2000" 
            alt="Barber Shop" 
            className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent flex flex-col items-center justify-end pb-16 px-6 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h2 className="text-5xl sm:text-7xl font-serif italic text-gold-200 mb-6 drop-shadow-2xl">
                {t.title}
              </h2>
              <div className="w-32 h-1 bg-gold-500 mx-auto mb-8 rounded-full shadow-lg shadow-gold-500/50" />
            </motion.div>
          </div>
        </motion.section>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-12 p-5 bg-gold-500/5 border border-gold-500/20 rounded-3xl flex items-center gap-5 shadow-2xl shadow-gold-500/5"
        >
          <div className="w-12 h-12 bg-gold-500/10 rounded-2xl flex items-center justify-center border border-gold-500/20">
            <AlertCircle className="text-gold-400" size={24} />
          </div>
          <p className="text-sm sm:text-base text-gold-100/80 font-medium leading-tight">{t.tenMinRule}</p>
        </motion.div>

        {!isStandalone && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="mb-12 p-6 bg-white/5 border border-white/10 rounded-[2rem] flex flex-col gap-6 shadow-2xl"
          >
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 bg-gold-500/10 rounded-2xl flex items-center justify-center border border-gold-500/20">
                <Download className="text-gold-500" size={28} />
              </div>
              <div>
                <h3 className="text-lg font-black uppercase tracking-widest text-gold-500 leading-none mb-1">{t.installApp}</h3>
                <p className="text-[10px] text-white/40 uppercase tracking-[0.2em] font-bold">{t.installInstructions}</p>
              </div>
            </div>
            
            <div className="grid gap-4">
              <div className={cn(
                "p-4 rounded-2xl border transition-all",
                isIOS ? "bg-gold-500/10 border-gold-500/30" : "bg-white/5 border-white/5 opacity-60"
              )}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-6 h-6 rounded-full bg-gold-500 flex items-center justify-center text-black text-[10px] font-black">1</div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gold-500">iPhone / Safari</p>
                </div>
                <p className="text-xs text-white/80 leading-relaxed font-medium">
                  {t.iosInstall}
                </p>
              </div>

              <div className={cn(
                "p-4 rounded-2xl border transition-all",
                !isIOS ? "bg-gold-500/10 border-gold-500/30" : "bg-white/5 border-white/5 opacity-60"
              )}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-white text-[10px] font-black">2</div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Android / Chrome</p>
                </div>
                <p className="text-xs text-white/60 leading-relaxed">
                  {t.androidInstall}
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Shop Main Booking */}
        {shopMain && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mb-24"
          >
            <div className={cn(
              "bg-black border border-gold-500/20 rounded-[2rem] sm:rounded-[4rem] p-6 sm:p-16 relative transition-all mx-auto max-w-5xl",
              "hover:border-gold-500/40 shadow-[0_0_100px_rgba(212,175,55,0.05)]"
            )}>
              <div className="flex flex-col lg:flex-row gap-12 sm:gap-16 items-center lg:items-start">
                <div className="flex-1 w-full">
                  <h2 className="text-5xl sm:text-8xl font-serif italic mb-2 bg-clip-text text-transparent bg-gradient-to-b from-gold-200 via-gold-400 to-gold-600 tracking-tight text-center lg:text-left">{shopMain?.name || t.title}</h2>
                  
                  {/* Shop Photos */}
                  <div className="mb-12">
                    <div className="flex flex-col items-center gap-8 mb-12">
                      <div className="relative group/clock">
                        <DigitalClock offset={settings.timeOffset} />
                        {(userRole === 'admin' || userRole === 'manager') && (
                          <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-2 opacity-0 group-hover/clock:opacity-100 transition-opacity bg-black/60 backdrop-blur-md p-2 rounded-xl border border-gold-500/20">
                            <button 
                              onClick={() => updateTimeOffset((settings.timeOffset || 0) - 60)}
                              className="w-8 h-8 flex items-center justify-center bg-white/5 rounded-lg hover:bg-white/10 text-gold-500"
                            >
                              -1h
                            </button>
                            <button 
                              onClick={() => updateTimeOffset((settings.timeOffset || 0) - 10)}
                              className="w-8 h-8 flex items-center justify-center bg-white/5 rounded-lg hover:bg-white/10 text-gold-500"
                            >
                              -10m
                            </button>
                            <button 
                              onClick={() => updateTimeOffset(0)}
                              className="px-2 h-8 flex items-center justify-center bg-white/5 rounded-lg hover:bg-white/10 text-[8px] font-black uppercase text-gold-500"
                            >
                              Reset
                            </button>
                            <button 
                              onClick={() => updateTimeOffset((settings.timeOffset || 0) + 10)}
                              className="w-8 h-8 flex items-center justify-center bg-white/5 rounded-lg hover:bg-white/10 text-gold-500"
                            >
                              +10m
                            </button>
                            <button 
                              onClick={() => updateTimeOffset((settings.timeOffset || 0) + 60)}
                              className="w-8 h-8 flex items-center justify-center bg-white/5 rounded-lg hover:bg-white/10 text-gold-500"
                            >
                              +1h
                            </button>
                          </div>
                        )}
                      </div>
                      
                      {(userRole === 'client' || userRole === 'manager' || userRole === 'admin') && (
                        <motion.button 
                          whileHover={{ scale: 1.05, y: -5 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => shopMain && setBookingModal({ barberId: shopMain.id })} 
                          className="w-full max-w-md py-6 bg-gradient-to-r from-gold-600 via-gold-500 to-gold-600 text-black rounded-[2rem] font-black text-xl uppercase tracking-[0.2em] shadow-[0_20px_50px_rgba(212,175,55,0.3)] hover:shadow-[0_25px_60px_rgba(212,175,55,0.4)] transition-all"
                        >
                          {t.bookNow}
                        </motion.button>
                      )}
                    </div>

                    <div className="flex flex-col xl:flex-row items-center justify-between gap-4 sm:gap-6 mb-6">
                      <h3 className="text-[11px] uppercase tracking-[0.3em] text-gold-500/60 font-black flex items-center gap-3">
                        <div className="w-8 h-[1px] bg-gold-500/30" />
                        {t.ourHaircuts}
                        <div className="w-8 h-[1px] bg-gold-500/30" />
                      </h3>
                      
                      <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                        {/* VIP Section */}
                        <div className="flex items-center gap-4 bg-gold-500/5 p-3 rounded-2xl border border-gold-500/10 flex-1 sm:flex-none">
                          <div className="relative group/vip w-10 h-10 bg-black rounded-lg border border-gold-500/20 overflow-hidden shrink-0">
                            {settings.vipPhotoUrl ? (
                              <img src={settings.vipPhotoUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Star className="text-gold-500/20" size={16} />
                              </div>
                            )}
                            {(userRole === 'admin' || userRole === 'manager') && (
                              <div className="absolute inset-0 bg-black/80 opacity-0 group-hover/vip:opacity-100 flex items-center justify-center transition-opacity gap-1">
                                <label className="cursor-pointer p-1 hover:text-gold-400">
                                  <Upload size={12} /><input type="file" accept="image/*" className="hidden" onChange={handleVipPhoto} />
                                </label>
                                {settings.vipPhotoUrl && (
                                  <button onClick={deleteVipPhoto} className="p-1 hover:text-red-400">
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-gold-500">{t.vipSection}</p>
                            <p className="text-[8px] text-white/40 uppercase tracking-tighter font-bold">{t.vipDetails}</p>
                          </div>
                        </div>

                        {/* Hammam Section */}
                        <div className="flex items-center gap-4 bg-blue-500/5 p-3 rounded-2xl border border-blue-500/10 flex-1 sm:flex-none">
                          <div className="w-10 h-10 bg-black rounded-lg border border-blue-500/20 flex items-center justify-center shrink-0">
                            <Droplets className="text-blue-500/40" size={20} />
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-blue-500">{t.hammam}</p>
                            <p className="text-[8px] text-white/40 uppercase tracking-tighter font-bold">{t.hammamDetails}</p>
                          </div>
                          <button 
                            onClick={() => shopMain && setBookingModal({ barberId: shopMain.id, serviceType: 'hammam' })}
                            className="ml-auto px-3 py-1.5 bg-blue-500 text-white rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-blue-400 transition-all"
                          >
                            {t.bookNow}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Planning en direct (Live Schedule) - Moved outside shopMain to be always visible */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mb-24 max-w-5xl mx-auto px-4 sm:px-0"
        >
          <div className="bg-black border border-gold-500/20 rounded-[2rem] sm:rounded-[4rem] p-6 sm:p-16 relative transition-all hover:border-gold-500/40 shadow-[0_0_100px_rgba(212,175,55,0.05)]">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-3xl font-serif italic text-gold-200">{t.liveSchedule}</h3>
                <p className="text-[10px] uppercase tracking-widest text-gold-500/40 mt-1">{t.allBookingsVisible}</p>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-gold-500/5 border border-gold-500/20 rounded-xl">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Live</span>
              </div>
            </div>

            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-4 custom-scrollbar">
              {bookings
                .filter(b => {
                  const isSelectedDay = b.dayName === viewDay || (!b.dayName && b.date && format(parseISO(b.date), 'EEEE') === viewDay);
                  return isSelectedDay;
                })
                .sort((a, b) => a.time.localeCompare(b.time))
                .map((b, i) => {
                  const barber = barbers.find(bar => bar.id === b.barberId);
                  return (
                    <motion.div
                      key={b.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="bg-white/5 border border-white/10 rounded-2xl p-5 flex items-center justify-between group hover:border-gold-500/30 transition-all"
                    >
                      <div className="flex items-center gap-5">
                        <span className="text-xs font-black text-gold-500/30 w-6">{String(i + 1).padStart(2, '0')}</span>
                        <div className="w-12 h-12 bg-gold-500/10 rounded-2xl flex items-center justify-center border border-gold-500/20 group-hover:bg-gold-500/20 transition-all">
                          <Clock size={20} className="text-gold-500" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-base font-black text-white/90">{b.clientName}</p>
                            {b.clientId === clientId && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="w-5 h-5 bg-gold-500 rounded-full flex items-center justify-center shadow-lg shadow-gold-500/40"
                                title="Your Booking"
                              >
                                <ShieldCheck size={12} className="text-black" />
                              </motion.div>
                            )}
                            {b.isManagerBooking && (userRole === 'manager' || userRole === 'admin') && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/40"
                                title="Manager Booking"
                              >
                                <ShieldCheck size={12} className="text-white" />
                              </motion.div>
                            )}
                            {b.isVip && (
                              <span className="px-2 py-0.5 bg-gold-500 text-black text-[8px] font-black uppercase rounded-md shadow-lg shadow-gold-500/20">VIP</span>
                            )}
                            {b.serviceType === 'hammam' && (
                              <span className="px-2 py-0.5 bg-blue-500 text-white text-[8px] font-black uppercase rounded-md shadow-lg shadow-blue-500/20">HAMMAM</span>
                            )}
                          </div>
                          <p className="text-[11px] text-gold-500/60 font-bold uppercase tracking-widest">
                            {b.time} • {b.date}
                            {b.bookedAt && (
                              <span className="ml-2 text-[9px] text-white/20 normal-case font-normal italic">
                                Booked at {b.bookedAt}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-[9px] text-white/20 uppercase font-black tracking-tighter mb-1">Barber</p>
                          <p className="text-xs text-gold-200 font-bold italic">{barber?.name || 'MR YOU'}</p>
                        </div>
                        <div className="flex items-center gap-2 border-l border-white/10 pl-4 ml-2">
                          {b.status === 'completed' ? (
                            <CheckCircle2 size={22} className="text-emerald-400" />
                          ) : b.status === 'missed' ? (
                            <XCircle size={22} className="text-red-400" />
                          ) : (
                            <div className="flex items-center gap-2">
                              {userRole !== 'client' ? (
                                <>
                                  <motion.button 
                                    whileTap={{ scale: 0.9 }} 
                                    onClick={() => completeBooking(b.id)} 
                                    className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl hover:bg-emerald-500/20 transition-colors border border-emerald-500/20" 
                                    title="Complete"
                                  >
                                    <CheckCircle2 size={18} />
                                  </motion.button>
                                  <motion.button 
                                    whileTap={{ scale: 0.9 }} 
                                    onClick={() => markAsMissed(b.id)} 
                                    className="p-2 bg-red-500/10 text-red-400 rounded-xl hover:bg-red-500/20 transition-colors border border-red-500/20" 
                                    title="Mark as Missed/Late"
                                  >
                                    <X size={18} />
                                  </motion.button>
                                </>
                              ) : b.clientId === clientId ? (
                                <motion.button 
                                  whileTap={{ scale: 0.9 }} 
                                  onClick={() => cancelBooking(b.id)} 
                                  className="p-2 bg-red-500/10 text-red-400 rounded-xl hover:bg-red-500/20 transition-colors border border-red-500/20" 
                                  title={t.cancelBooking}
                                >
                                  <X size={18} />
                                </motion.button>
                              ) : null}
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              {bookings.filter(b => {
                  const isSelectedDay = b.dayName === viewDay || (!b.dayName && b.date && format(parseISO(b.date), 'EEEE') === viewDay);
                  return isSelectedDay;
                }).length === 0 && (
                <div className="py-16 bg-white/5 border border-dashed border-white/10 rounded-3xl text-center">
                  <p className="text-xs text-white/20 uppercase font-black tracking-widest">No active bookings for this day</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>



        {/* Barbers Section */}
        <div className="max-w-7xl mx-auto px-4 mb-32">
          <div className="flex flex-col items-center mb-16">
            <h2 className="text-4xl font-serif italic text-gold-200 mb-4">{t.barbers}</h2>
            <div className="w-24 h-[1px] bg-gold-500/30 mb-8" />
            
            {/* Choose Personal Barber Button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowPersonalBarbers(!showPersonalBarbers)}
              className={cn(
                "px-8 py-4 rounded-full font-black uppercase tracking-[0.2em] text-[10px] transition-all flex items-center gap-3 border",
                showPersonalBarbers 
                  ? "bg-gold-500 text-black border-gold-500 shadow-xl shadow-gold-500/20" 
                  : "bg-white/5 text-gold-500 border-gold-500/20 hover:border-gold-500/50"
              )}
            >
              <Scissors size={14} />
              {t.choosePersonalBarber}
              {showPersonalBarbers ? <X size={14} /> : null}
            </motion.button>
          </div>

          <AnimatePresence mode="wait">
            {showPersonalBarbers && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8"
              >
                {workers.filter(b => !b.isKicked).map((barber, idx) => (
                  <motion.div 
                    key={barber.id} 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="bg-black border border-gold-500/10 rounded-[3rem] p-8 relative hover:border-gold-500/40 transition-all group shadow-2xl"
                  >
                    <div className="absolute top-8 right-8 flex items-center gap-2">
                      {(userRole === 'admin' || userRole === 'manager') && (
                        <button 
                          onClick={() => kickBarber(barber.id)}
                          className="px-3 py-1 bg-red-600 text-white rounded-full text-[9px] font-black uppercase border border-red-500/20 hover:bg-red-500 transition-all"
                        >
                          {t.kick}
                        </button>
                      )}
                      <div className={cn("px-3 py-1 rounded-full text-[9px] font-black uppercase border flex items-center gap-2 backdrop-blur-sm", barber.status === 'available' ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5" : barber.status === 'working' ? "text-red-400 border-red-500/20 bg-red-500/5" : "text-white/40 border-white/10 bg-white/5")}>
                        <div className={cn("w-1.5 h-1.5 rounded-full", barber.status === 'available' ? "bg-emerald-400 animate-pulse" : barber.status === 'working' ? "bg-red-400" : "bg-white/40")} />
                        {t[barber.status]}
                      </div>
                    </div>
                    <div className="relative w-24 h-24 bg-gold-500/5 rounded-3xl mb-8 flex items-center justify-center border border-gold-500/20 overflow-hidden group/photo shadow-xl">
                      {barber.photoUrl ? <img src={barber.photoUrl} className="w-full h-full object-cover transition-transform duration-500 group-hover/photo:scale-110" referrerPolicy="no-referrer" /> : <User className="text-gold-500/10" size={40} />}
                      {(userRole === 'admin' || userRole === 'manager') && (
                        <div className="absolute inset-0 bg-black/80 opacity-0 group-hover/photo:opacity-100 flex items-center justify-center transition-all duration-300 gap-3 backdrop-blur-sm">
                          <label className="cursor-pointer p-2 bg-gold-500 text-black rounded-full hover:scale-110 transition-transform">
                            <Camera size={18} /><input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhoto(barber.id, e)} />
                          </label>
                          {barber.photoUrl && (
                            <button onClick={() => deleteBarberPhoto(barber.id)} className="p-2 bg-red-600 text-white rounded-full hover:scale-110 transition-transform">
                              <Trash2 size={18} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <h3 className="text-2xl font-serif italic text-gold-100 mb-1">{barber.name}</h3>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-gold-500/40 font-black mb-8">Master Barber</p>

                    <div className="space-y-3 mb-8 max-h-56 overflow-y-auto pr-2 custom-scrollbar">
                      {bookings
                        .filter(b => b.barberId === barber.id && (b.dayName === viewDay || (!b.dayName && format(parseISO(b.date), 'EEEE') === viewDay)))
                        .map((b, i) => {
                          const isToday = b.date === format(new Date(), 'yyyy-MM-dd');
                        return (
                          <motion.div 
                            key={b.id} 
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className={cn("flex items-center justify-between p-4 rounded-2xl border transition-all", isToday ? "bg-gold-500/5 border-gold-500/30" : "bg-white/5 border-white/5 hover:border-white/10")}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-black text-gold-500/30">{String(i + 1).padStart(2, '0')}</span>
                              <div>
                                <p className="text-[11px] font-black tracking-wide flex items-center gap-2">
                                  {b.clientName}
                                  {b.clientId === clientId && (
                                    <ShieldCheck size={10} className="text-gold-500" />
                                  )}
                                  {b.isManagerBooking && (userRole === 'manager' || userRole === 'admin') && (
                                    <ShieldCheck size={10} className="text-blue-400" />
                                  )}
                                  {b.serviceType === 'hammam' && (
                                    <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[7px] uppercase font-black">Hammam</span>
                                  )}
                                </p>
                                <p className="text-[9px] text-white/40 font-bold uppercase tracking-widest mt-0.5">
                                  {b.time}
                                  {b.bookedAt && (
                                    <span className="ml-2 text-[8px] text-white/20 normal-case font-normal italic">
                                      ({b.bookedAt})
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {b.status === 'completed' ? <CheckCircle2 size={16} className="text-emerald-400" /> : b.status === 'missed' ? <XCircle size={16} className="text-red-400" /> : (
                                <div className="flex items-center gap-1.5">
                                  {userRole !== 'client' && (userRole !== 'worker' || workerId === barber.id) ? (
                                    <>
                                      <motion.button whileTap={{ scale: 0.9 }} onClick={() => completeBooking(b.id)} className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-xl hover:bg-emerald-500/20 transition-colors" title="Complete"><CheckCircle2 size={16} /></motion.button>
                                      <motion.button whileTap={{ scale: 0.9 }} onClick={() => markAsMissed(b.id)} className="p-1.5 bg-red-500/10 text-red-400 rounded-xl hover:bg-red-500/20 transition-colors" title="Mark as Missed/Late"><X size={16} /></motion.button>
                                    </>
                                  ) : b.clientId === clientId ? (
                                    <motion.button whileTap={{ scale: 0.9 }} onClick={() => cancelBooking(b.id)} className="p-1.5 bg-red-500/10 text-red-400 rounded-xl hover:bg-red-500/20 transition-colors" title={t.cancelBooking}><X size={16} /></motion.button>
                                  ) : null}
                                </div>
                              )}
                              {userRole === 'admin' && (
                                <motion.button whileTap={{ scale: 0.9 }} onClick={() => deleteBooking(b.id)} className="p-1.5 bg-red-500/10 text-red-400 rounded-xl hover:bg-red-500/20 transition-colors"><Trash2 size={16} /></motion.button>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                      {bookings.filter(b => b.barberId === barber.id && (b.dayName === viewDay || (!b.dayName && format(parseISO(b.date), 'EEEE') === viewDay))).length === 0 && (
                        <p className="text-center py-8 text-[10px] text-white/10 uppercase tracking-[0.2em] font-black border border-dashed border-white/5 rounded-2xl">{t.noBookings}</p>
                      )}
                    </div>
                    {(userRole === 'client' || userRole === 'manager' || userRole === 'admin') && barber.status !== 'unavailable' && (
                      <motion.button 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setBookingModal({ barberId: barber.id })} 
                        className="w-full py-5 bg-gold-500 text-black rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-gold-500/10 hover:shadow-gold-500/20 transition-all"
                      >
                        {t.bookNow}
                      </motion.button>
                    )}
                    {userRole !== 'client' && (userRole !== 'worker' || workerId === barber.id) && (
                      <div className="grid grid-cols-3 gap-2">
                        {['available', 'working', 'unavailable'].map(s => (
                          <button key={s} onClick={() => updateStatus(barber.id, s as any)} className={cn("py-2 rounded-xl text-[10px] font-bold uppercase border", barber.status === s ? "bg-gold-500/10 border-gold-500/20 text-gold-500" : "border-white/5 text-white/20")}>{t[s as keyof typeof t].slice(0, 3)}</button>
                        ))}
                      </div>
                    )}
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Unbanned Section */}
          {(userRole === 'admin' || userRole === 'manager') && workers.some(b => b.isKicked) && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-24 pt-12 border-t border-white/5"
            >
              <h3 className="text-2xl font-serif italic text-gold-500 mb-8">{t.unbannedSection}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {workers.filter(b => b.isKicked).map(barber => (
                  <div key={barber.id} className="bg-white/5 border border-white/10 rounded-3xl p-6 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white/5 rounded-xl overflow-hidden border border-white/10">
                        {barber.photoUrl ? <img src={barber.photoUrl} className="w-full h-full object-cover" /> : <User className="text-white/10 m-auto" size={24} />}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white/80">{barber.name}</p>
                        <p className="text-[10px] text-red-400 uppercase font-black tracking-widest">Kicked</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => unbanBarber(barber.id)}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 transition-all"
                    >
                      {t.unban}
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </main>

      {(userRole === 'admin' || userRole === 'manager') && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4">
          <motion.button 
            whileHover={{ scale: 1.05, y: -5 }}
            whileTap={{ scale: 0.95 }}
            onClick={clearDay} 
            className="px-8 py-5 bg-red-600/20 text-red-500 rounded-full font-black uppercase tracking-widest text-[10px] shadow-2xl flex items-center gap-3 border border-red-500/20 backdrop-blur-xl"
          >
            <Trash2 size={16} />
            {t.clearDay}
          </motion.button>

          <motion.button 
            whileHover={{ scale: 1.05, y: -5 }}
            whileTap={{ scale: 0.95 }}
            onClick={clearAllBookings} 
            className="px-8 py-5 bg-red-600 text-white rounded-full font-black uppercase tracking-widest text-[10px] shadow-[0_20px_40px_rgba(220,38,38,0.3)] flex items-center gap-3 border border-red-500/20"
          >
            <Trash2 size={16} />
            Wipe All
          </motion.button>
        </div>
      )}

      <footer className="max-w-7xl mx-auto px-4 py-20 border-t border-gold-500/10 mt-20">
        <div className="flex flex-col items-center gap-12 mb-12">
          {userRole !== 'client' && (
            <motion.button 
              whileTap={{ scale: 0.95 }}
              onClick={() => { setUserRole('client'); setWorkerId(null); }} 
              className="px-12 py-4 bg-red-600/10 text-red-400 rounded-full border border-red-600/20 text-xs font-black uppercase tracking-[0.3em] hover:bg-red-600/20 transition-all shadow-xl"
            >
              {t.logout}
            </motion.button>
          )}
        </div>
        <div className="flex flex-col md:flex-row justify-between items-center gap-12">
          <div className="text-center md:text-left">
            <h3 
              onClick={() => userRole === 'client' && setShowLogin(true)} 
              className={cn("text-3xl font-serif italic text-gold-200 mb-2 transition-all", userRole === 'client' && "cursor-pointer hover:text-gold-400 active:scale-95")}
            >
              {t.title}
            </h3>
          </div>
          <div className="flex gap-8">
            <a href="https://www.instagram.com/mryou.spa?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==" target="_blank" rel="noopener noreferrer" className="text-[10px] font-black uppercase tracking-widest text-white/20 hover:text-gold-500 transition-colors">Instagram</a>
          </div>
          <p className="text-[10px] font-bold text-white/10 uppercase tracking-widest">© 2024 {t.title}. All rights reserved.</p>
        </div>
      </footer>

      <AnimatePresence>
        {confirmModal && (
          <div key="confirm-modal" className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-black border border-gold-500/20 p-8 rounded-[2rem] max-w-sm w-full text-center shadow-2xl"
            >
              <AlertCircle className="mx-auto text-gold-500 mb-4" size={48} />
              <p className="text-lg font-black uppercase tracking-tight mb-6">{confirmModal.message}</p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setConfirmModal(null)}
                  className="flex-1 py-3 bg-white/5 rounded-xl font-bold border border-white/10 hover:bg-white/10 transition-all"
                >
                  {t.cancel}
                </button>
                <button 
                  onClick={async () => { 
                    try {
                      await confirmModal.onConfirm(); 
                    } catch (err) {
                      console.error("Confirm error:", err);
                    }
                    setConfirmModal(null); 
                  }}
                  className="flex-1 py-3 bg-red-600 rounded-xl font-bold shadow-lg shadow-red-600/20"
                >
                  {t.confirm}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {alertModal && (
          <div key="alert-modal" className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-black border border-gold-500/20 p-8 rounded-[2rem] max-w-sm w-full text-center shadow-2xl"
            >
              <AlertCircle className="mx-auto text-gold-500 mb-4" size={48} />
              <p className="text-lg font-black uppercase tracking-tight mb-6">{alertModal}</p>
              <button 
                onClick={() => setAlertModal(null)}
                className="w-full py-4 bg-gold-500 text-black rounded-xl font-black shadow-lg shadow-gold-500/20 hover:scale-[1.02] transition-all"
              >
                OK
              </button>
            </motion.div>
          </div>
        )}

        {showLogin && (
          <div key="login-modal" className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/95 backdrop-blur-2xl" onClick={() => setShowLogin(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="relative w-full max-w-md bg-black border border-gold-500/20 rounded-[3rem] p-10 sm:p-12 shadow-[0_0_100px_rgba(212,175,55,0.1)]">
              <h2 className="text-4xl font-serif italic text-gold-200 text-center mb-10">{t.login}</h2>
              <form onSubmit={handleLogin} className="space-y-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-500/60 ml-6">Username</label>
                  <input type="text" required value={loginForm.name} onChange={e => setLoginForm({...loginForm, name: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-[1.5rem] px-8 py-5 focus:border-gold-500/50 outline-none transition-all text-lg" placeholder="Enter your name" />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-500/60 ml-6">Password</label>
                  <input type="password" required value={loginForm.password} onChange={e => setLoginForm({...loginForm, password: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-[1.5rem] px-8 py-5 focus:border-gold-500/50 outline-none transition-all text-lg" placeholder="••••••••" />
                </div>
                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit" 
                  className="w-full py-6 bg-gold-500 text-black rounded-[1.5rem] font-black text-xl uppercase tracking-[0.2em] shadow-2xl shadow-gold-500/20"
                >
                  {t.login}
                </motion.button>
              </form>
            </motion.div>
          </div>
        )}
        {bookingModal && (
          <div key="booking-modal" className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/95 backdrop-blur-2xl" onClick={() => setBookingModal(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="relative w-full max-w-xl bg-black border border-gold-500/20 rounded-[3rem] p-8 sm:p-12 shadow-[0_0_100px_rgba(212,175,55,0.1)]">
              <h2 className="text-4xl font-serif italic text-gold-200 text-center mb-10">{t.bookNow}</h2>
              <div className="space-y-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-500/60 ml-6">{t.clientName}</label>
                  <input type="text" value={clientName} onChange={e => setClientName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-[1.5rem] px-8 py-5 focus:border-gold-500/50 outline-none transition-all text-lg font-medium" placeholder="Your full name" />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-500/60 ml-6">{t.pickDate}</label>
                    <input type="date" value={bookingDate} onChange={e => setBookingDate(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-[1.5rem] px-8 py-5 focus:border-gold-500/50 outline-none transition-all font-bold" />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-500/60 ml-6">{t.pickTime}</label>
                    <input type="time" value={bookingTime} onChange={e => setBookingTime(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-[1.5rem] px-8 py-5 focus:border-gold-500/50 outline-none transition-all font-bold" />
                  </div>
                </div>

                {/* VIP Toggle */}
                {shopMain && bookingModal.barberId === shopMain.id && bookingModal.serviceType !== 'hammam' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-6 bg-gold-500/5 border border-gold-500/20 rounded-[2rem] flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-black rounded-xl border border-gold-500/20 flex items-center justify-center shrink-0">
                        <Star className={cn("transition-colors", isVipBooking ? "text-gold-500" : "text-white/10")} size={20} />
                      </div>
                      <div>
                        <p className="text-xs font-black uppercase tracking-widest text-gold-500">{t.vipBooking}</p>
                        <p className="text-[9px] text-white/40 uppercase tracking-tighter font-bold">{t.vipDetails}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setIsVipBooking(!isVipBooking)}
                      className={cn(
                        "w-14 h-8 rounded-full transition-all relative",
                        isVipBooking ? "bg-gold-500" : "bg-white/10"
                      )}
                    >
                      <motion.div 
                        animate={{ x: isVipBooking ? 24 : 4 }}
                        className="w-6 h-6 bg-white rounded-full absolute top-1"
                      />
                    </button>
                  </motion.div>
                )}

                <div className="flex gap-6 pt-4">
                  <motion.button 
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setBookingModal(null)} 
                    className="flex-1 py-5 bg-white/5 rounded-[1.5rem] font-black uppercase tracking-widest text-xs border border-white/10 hover:bg-white/10 transition-all"
                  >
                    {t.cancel}
                  </motion.button>
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleBooking} 
                    disabled={!clientName || !bookingTime} 
                    className="flex-[2] py-5 bg-gold-500 text-black rounded-[1.5rem] font-black text-xl uppercase tracking-[0.2em] shadow-2xl shadow-gold-500/20 disabled:opacity-50 disabled:hover:scale-100"
                  >
                    {t.confirm}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {stagedImages.length > 0 && (
          <motion.div 
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            className="fixed bottom-8 right-8 z-[150] flex flex-col items-end gap-4"
          >
            <div className="bg-black/80 backdrop-blur-xl border border-gold-500/20 p-4 rounded-2xl shadow-2xl flex flex-col gap-2 min-w-[200px]">
              <p className="text-[10px] font-black uppercase tracking-widest text-gold-500">Staged Items ({stagedImages.length})</p>
              <div className="max-h-[200px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                {stagedImages.map(img => (
                  <div key={img.id} className="flex items-center justify-between gap-3 p-2 bg-white/5 rounded-lg border border-white/10">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <img src={img.data} className="w-8 h-8 rounded object-cover shrink-0" referrerPolicy="no-referrer" />
                      <span className="text-[9px] text-white/40 truncate font-bold uppercase tracking-tighter">{img.name}</span>
                    </div>
                    <button onClick={() => removeStaged(img.id)} className="text-red-500 hover:text-red-400 p-1">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <button 
                onClick={saveAllStaged}
                className="w-full py-3 bg-emerald-500 text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-emerald-500/20 hover:scale-[1.02] transition-all mt-2"
              >
                Save All Changes
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() { 
  return (
    <BarberShop />
  ); 
}
