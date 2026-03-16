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
  Bell,
  X,
  Star,
  Droplets,
  Video
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
  limit,
  addDoc, 
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, auth, storage } from './firebase';
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
      let displayMessage = "Something went wrong. Please try again later.";
      let isQuotaError = false;

      try {
        const errorData = JSON.parse(this.state.error?.message);
        if (errorData.error && errorData.error.includes("Quota limit exceeded")) {
          isQuotaError = true;
          displayMessage = "The application has reached its daily database limit. This usually resets every 24 hours at midnight. Please check back tomorrow!";
        } else {
          displayMessage = errorData.error || displayMessage;
        }
      } catch (e) {
        displayMessage = this.state.error?.message || displayMessage;
      }

      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-gold-500/10 border border-gold-500/20 rounded-[2.5rem] p-10 shadow-2xl">
            <AlertCircle className="text-gold-400 mx-auto mb-4" size={48} />
            <h2 className="text-2xl font-black uppercase tracking-tighter text-white mb-4">
              {isQuotaError ? "Daily Limit Reached" : "Application Error"}
            </h2>
            <p className="text-gold-200/60 text-sm mb-8 leading-relaxed">
              {displayMessage}
            </p>
            <div className="flex flex-col gap-4">
              <button 
                onClick={() => window.location.reload()} 
                className="w-full py-4 bg-gold-500 text-black rounded-2xl font-black uppercase tracking-widest hover:bg-gold-400 transition-all shadow-lg shadow-gold-500/20"
              >
                Try Again
              </button>
              {isQuotaError && (
                <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest">
                  Resetting in approx. 12 hours
                </p>
              )}
            </div>
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
interface GalleryVideo { id: string; url: string; storagePath?: string; createdAt: any; }
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
    workingDays: 'Tuesday - Sunday (10:00 - 22:00)', tenMinRule: 'Note: Max 10 mins late or booking missed.',
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
    hammamDetails: 'Soaps, professional cleaning, towels, and all you need.',
    kick: 'Kick',
    unban: 'Unban',
    unbannedSection: 'Unbanned Section',
    gallery: 'Gallery',
    uploadVideo: 'Upload Video',
    kickedMessage: 'You have been kicked from the shop. Access denied.'
  },
  fr: {
    title: 'MR YOU', 
    subtitle: '', 
    available: 'Disponible', working: 'En cours', unavailable: 'Indisponible',
    bookNow: 'Réserver', clientName: 'Votre Nom', pickTime: 'Choisir l\'heure', pickDate: 'Choisir la date', confirm: 'Confirmer', cancel: 'Annuler',
    admin: 'Admin', manager: 'Gérant', worker: 'Coiffeur', login: 'Connexion', password: 'Mot de passe', clearDay: 'Effacer',
    workingDays: 'Mardi - Dimanche (10:00 - 22:00)', tenMinRule: 'Note: Max 10 min de retard ou annulé.',
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
    gallery: 'Galerie',
    uploadVideo: 'Télécharger Vidéo',
    kickedMessage: 'Vous avez été renvoyé du salon. Accès refusé.'
  },
  ar: {
    title: 'MR YOU', 
    subtitle: '', 
    available: 'متاح', working: 'يعمل', unavailable: 'غير متاح',
    bookNow: 'احجز الآن', clientName: 'اسمك', pickTime: 'اختر الوقت', pickDate: 'اختر التاريخ', confirm: 'تأكيد الحجز', cancel: 'إلغاء',
    admin: 'مسؤول', manager: 'مدير', worker: 'حلاق', login: 'تسجيل الدخول', password: 'كلمة المرور', clearDay: 'مسح اليوم',
    workingDays: 'الثلاثاء - الأحد (10:00 - 22:00)', tenMinRule: 'ملاحظة: 10 دقائق كحد أقصى للوصول.',
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
    gallery: 'المعرض',
    uploadVideo: 'رفع فيديو',
    kickedMessage: 'لقد تم طردك من المحل. تم رفض الوصول.'
  }
};

function BarberShop() {
  const [lang, setLang] = useState<'en' | 'fr' | 'ar'>('fr');
  const [userRole, setUserRole] = useState<Role>('client');
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [settings, setSettings] = useState({ currentDay: 'Thursday', logoUrl: '', shopPhotos: ['', '', ''], vipPhotoUrl: '' });
  const [galleryVideos, setGalleryVideos] = useState<GalleryVideo[]>([]);
  const [sessionId] = useState(() => Math.random().toString(36).substring(7));
  const [showWorkers, setShowWorkers] = useState(false);
  const [showPersonalBarbers, setShowPersonalBarbers] = useState(false);
  const [isVipBooking, setIsVipBooking] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [loginForm, setLoginForm] = useState({ name: '', password: '' });
  const [bookingModal, setBookingModal] = useState<{ barberId: string; serviceType?: 'haircut' | 'hammam' } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [alertModal, setAlertModal] = useState<string | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
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
      
      // Ensure "MR you" shop entry exists
      const hasShop = data.some(b => b.isShop);
      if (data.length > 0 && !hasShop) {
        addDoc(collection(db, 'barbers'), { name: 'MR you', status: 'available', order: 0, isShop: true })
          .catch(e => handleFirestoreError(e, OperationType.WRITE, 'barbers'));
      }

      if (data.length === 0) {
        const batch = writeBatch(db);
        // Add Shop Main
        batch.set(doc(collection(db, 'barbers')), { name: 'MR you', status: 'available', order: 0, isShop: true });
        for (let i = 1; i <= 8; i++) {
          batch.set(doc(collection(db, 'barbers')), { name: `Barber n.o${i}`, status: 'unavailable', order: i });
        }
        batch.commit().catch(e => handleFirestoreError(e, OperationType.WRITE, 'barbers'));
      }
      setBarbers(data);
    }, (e) => handleFirestoreError(e, OperationType.GET, 'barbers'));

    const qBk = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'), limit(100));
    const unsubBk = onSnapshot(qBk, (snap) => {
      setBookings(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking)).reverse());
    }, (e) => handleFirestoreError(e, OperationType.GET, 'bookings'));

    const qN = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(30));
    const unsubN = onSnapshot(qN, (snap) => {
      setNotifications(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification)));
    }, (e) => handleFirestoreError(e, OperationType.GET, 'notifications'));

    const unsubS = onSnapshot(doc(db, 'settings', 'global'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setSettings({
          currentDay: data.currentDay || 'Thursday',
          logoUrl: data.logoUrl || '',
          shopPhotos: data.shopPhotos || ['', '', ''],
          vipPhotoUrl: data.vipPhotoUrl || ''
        });
        
        const currentLogo = data.logoUrl || 'https://storage.googleapis.com/m-ai-studio/m-ai-studio-public/attachments/67d6e647-86c4-4b55-8774-60e0a516087d.png';
        
        const link = document.querySelector("link[rel~='icon']") || document.createElement('link');
        (link as HTMLLinkElement).rel = 'icon';
        (link as HTMLLinkElement).href = currentLogo;
        document.getElementsByTagName('head')[0].appendChild(link);

        const appleIcon = document.getElementById('apple-icon');
        if (appleIcon) appleIcon.setAttribute('href', currentLogo);
      } else {
        setDoc(doc(db, 'settings', 'global'), { currentDay: 'Thursday', logoUrl: '', shopPhotos: ['', '', ''] })
          .catch(e => handleFirestoreError(e, OperationType.WRITE, 'settings/global'));
      }
    }, (e) => handleFirestoreError(e, OperationType.GET, 'settings/global'));

    const qG = query(collection(db, 'gallery'), orderBy('createdAt', 'desc'), limit(20));
    const unsubG = onSnapshot(qG, (snap) => {
      setGalleryVideos(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as GalleryVideo)));
    }, (e) => handleFirestoreError(e, OperationType.GET, 'gallery'));

    return () => { unsubB(); unsubBk(); unsubN(); unsubS(); unsubG(); };
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

    // For iOS or if the event doesn't fire, we can show a manual guide after some time
    const timer = setTimeout(() => {
      if (!isStandaloneMode) {
        setShowInstallButton(true);
      }
    }, 6000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      clearTimeout(timer);
    };
  }, [deferredPrompt]);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          setDeferredPrompt(null);
          setShowInstallButton(false);
        }
      } catch (err) {
        console.error('Installation prompt failed:', err);
      }
    } else if (isIOS) {
      setAlertModal('To install on iPhone: Tap the "Share" button at the bottom of Safari and select "Add to Home Screen".');
    } else {
      setAlertModal('The app is preparing for installation. If the prompt doesn\'t appear in a few seconds, please use the browser menu (three dots) and select "Install App".');
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
    else if (name === 'worker' && password.startsWith('worker')) {
      const num = parseInt(password.replace('worker', ''));
      if (num >= 1 && num <= 8) {
        const barber = barbers.find(b => b.order === num);
        if (barber?.isKicked) {
          setAlertModal(t.kickedMessage);
          return;
        }

        try {
          await updateDoc(doc(db, 'barbers', barber!.id), { 
            lastActive: serverTimestamp()
          });
          setUserRole('worker');
          setWorkerId(barber?.id || null);
          setShowLogin(false);
        } catch (e) {
          handleFirestoreError(e, OperationType.UPDATE, `barbers/${barber?.id}`);
        }
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
        createdAt: serverTimestamp(),
        isVip: isVipBooking,
        serviceType: bookingModal.serviceType || 'haircut'
      });
      
      // Create notification
      await addDoc(collection(db, 'notifications'), {
        barberId: bookingModal.barberId,
        message: `${isVipBooking ? '[VIP] ' : ''}${bookingModal.serviceType === 'hammam' ? '[HAMMAM] ' : ''}${t.newBooking} ${clientName} ${t.at} ${bookingTime} (${dayName} ${bookingDate})`,
        createdAt: serverTimestamp(),
        read: false
      });

      setBookingModal(null); setClientName(''); setBookingTime(''); setIsVipBooking(false);
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

  const handleShopPhoto = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const newPhotos = [...settings.shopPhotos];
      newPhotos[index] = reader.result as string;
      try {
        await updateDoc(doc(db, 'settings', 'global'), { shopPhotos: newPhotos });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, 'settings/global');
      }
    };
    reader.readAsDataURL(file);
  };

  const deleteShopPhoto = async (index: number) => {
    setConfirmModal({
      message: 'Delete this shop photo?',
      onConfirm: async () => {
        const newPhotos = [...settings.shopPhotos];
        newPhotos[index] = '';
        try {
          await updateDoc(doc(db, 'settings', 'global'), { shopPhotos: newPhotos });
        } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'settings/global'); }
      }
    });
  };

  const handleVipPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        await updateDoc(doc(db, 'settings', 'global'), { vipPhotoUrl: reader.result as string });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, 'settings/global');
      }
    };
    reader.readAsDataURL(file);
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

  const markAsMissed = async (id: string) => {
    try { await updateDoc(doc(db, 'bookings', id), { status: 'missed' }); }
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

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('video/')) {
      setAlertModal('Please upload a video file');
      return;
    }

    if (file.size > 1000 * 1024 * 1024) { // 1000MB limit
      setAlertModal('Video must be smaller than 1000MB.');
      return;
    }

    setAlertModal('Uploading video... Please wait.');
    
    try {
      const storageRef = ref(storage, `gallery/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      await addDoc(collection(db, 'gallery'), {
        url: downloadURL,
        storagePath: storageRef.fullPath,
        createdAt: serverTimestamp()
      });
      setAlertModal('Video uploaded successfully!');
    } catch (err) {
      console.error(err);
      setAlertModal('Upload failed. Please check your connection and try again.');
    }
  };

  const deleteVideo = async (id: string) => {
    const video = galleryVideos.find(v => v.id === id);
    setConfirmModal({
      message: 'Delete this video?',
      onConfirm: async () => {
        try {
          if (video?.storagePath) {
            const storageRef = ref(storage, video.storagePath);
            await deleteObject(storageRef).catch(e => console.error('Storage delete failed:', e));
          }
          await deleteDoc(doc(db, 'gallery', id));
        } catch (e) { handleFirestoreError(e, OperationType.DELETE, `gallery/${id}`); }
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
      const isShop = n.barberId === shopMain?.id;
      if (isShop) {
        return userRole === 'manager';
      }
      if (userRole === 'worker') {
        return n.barberId === workerId;
      }
      return userRole === 'admin' || userRole === 'manager';
    });
  }, [notifications, userRole, workerId, shopMain]);

  return (
    <div className={cn("min-h-screen bg-black text-white selection:bg-gold-500/30 selection:text-gold-200", isRtl ? 'rtl' : 'ltr')}>
      <header className="border-b border-gold-500/10 bg-black/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="bg-gradient-to-r from-gold-950/40 via-black to-gold-950/40 border-b border-gold-500/10 py-3 overflow-x-auto custom-scrollbar">
          <div className="max-w-7xl mx-auto px-4 flex items-center justify-center gap-3 min-w-max">
            {['Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (
              <motion.button
                key={day}
                whileTap={{ scale: 0.95 }}
                onClick={() => updateCurrentDay(day)}
                className={cn(
                  "px-5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
                  settings.currentDay === day 
                    ? "bg-gold-500 text-black shadow-lg shadow-gold-500/40" 
                    : "text-white/40 hover:text-white/60 bg-white/5"
                )}
              >
                {(t as any).days[day]}
              </motion.button>
            ))}
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

      <AnimatePresence>
        {showInstallButton && userRole === 'client' && !isStandalone && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-24 left-4 right-4 z-[100]"
          >
            <div className="bg-gold-500 rounded-2xl p-4 flex items-center justify-between shadow-2xl shadow-gold-500/20 border border-white/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
                  <Scissors size={20} className="text-gold-500" />
                </div>
                <div>
                  <p className="text-xs font-black text-black uppercase tracking-tight">
                    {isIOS ? 'Install MR YOU on iPhone' : 'Install MR YOU App'}
                  </p>
                  <p className="text-[10px] text-black/60 font-bold">
                    {isIOS ? 'Tap Share > Add to Home Screen' : 'Book faster from your home screen'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleInstallClick}
                className="px-4 py-2 bg-black text-gold-500 rounded-lg text-[10px] font-black uppercase tracking-widest"
              >
                {isIOS ? 'How?' : 'Install'}
              </button>
              <button 
                onClick={() => setShowInstallButton(false)}
                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg"
              >
                <X size={12} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:py-12">
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
                  <h2 className="text-5xl sm:text-8xl font-serif italic mb-2 bg-clip-text text-transparent bg-gradient-to-b from-gold-200 via-gold-400 to-gold-600 tracking-tight text-center lg:text-left">{shopMain.name}</h2>
                  
                  {/* Shop Photos */}
                  <div className="mb-12">
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
                            onClick={() => setBookingModal({ barberId: shopMain.id, serviceType: 'hammam' })}
                            className="ml-auto px-3 py-1.5 bg-blue-500 text-white rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-blue-400 transition-all"
                          >
                            {t.bookNow}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 sm:gap-6">
                      {settings.shopPhotos.map((photo, idx) => (
                        <motion.div 
                          key={idx} 
                          whileHover={{ scale: 1.05, rotate: idx % 2 === 0 ? 1 : -1 }}
                          className="aspect-[4/5] bg-white/5 rounded-[2rem] border border-white/10 overflow-hidden relative group/shop-photo shadow-2xl"
                        >
                          {photo ? (
                            <img src={photo} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ImageIcon className="text-white/5" size={32} />
                            </div>
                          )}
                          {(userRole === 'admin' || userRole === 'manager') && (
                            <div className="absolute inset-0 bg-black/80 opacity-0 group-hover/shop-photo:opacity-100 flex flex-col items-center justify-center transition-all duration-300 gap-4 backdrop-blur-sm">
                              <label className="cursor-pointer p-3 bg-gold-500 text-black rounded-full hover:scale-110 transition-transform shadow-xl">
                                <Upload size={20} /><input type="file" accept="image/*" className="hidden" onChange={(e) => handleShopPhoto(idx, e)} />
                              </label>
                              {photo && (
                                <button onClick={() => deleteShopPhoto(idx)} className="p-3 bg-red-600 text-white rounded-full hover:scale-110 transition-transform shadow-xl">
                                  <Trash2 size={20} />
                                </button>
                              )}
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>

                    {/* Gallery Section */}
                    <div className="mt-12">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xl font-black uppercase tracking-widest text-gold-500">{t.gallery}</h3>
                        {(userRole === 'admin' || userRole === 'manager') && (
                          <label className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-gold-500 text-black rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all">
                            <Video size={16} />
                            {t.uploadVideo}
                            <input type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
                          </label>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {galleryVideos.map((video) => (
                          <div key={video.id} className="aspect-[9/16] bg-white/5 rounded-2xl border border-white/10 overflow-hidden relative group/video shadow-xl">
                            <video 
                              src={video.url} 
                              className="w-full h-full object-cover" 
                              loop 
                              muted 
                              playsInline 
                              controls
                              onMouseOver={e => e.currentTarget.play()} 
                              onMouseOut={e => e.currentTarget.pause()} 
                            />
                            {(userRole === 'admin' || userRole === 'manager') && (
                              <button 
                                onClick={() => deleteVideo(video.id)}
                                className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-full z-10"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Planning en direct (Live Schedule) */}
                    <div className="mt-16">
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
                            const isToday = b.date === format(new Date(), 'yyyy-MM-dd');
                            const isCurrentDay = b.dayName === settings.currentDay || (!b.dayName && format(parseISO(b.date), 'EEEE') === settings.currentDay);
                            return isToday || isCurrentDay;
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
                                      {b.isVip && (
                                        <span className="px-2 py-0.5 bg-gold-500 text-black text-[8px] font-black uppercase rounded-md shadow-lg shadow-gold-500/20">VIP</span>
                                      )}
                                      {b.serviceType === 'hammam' && (
                                        <span className="px-2 py-0.5 bg-blue-500 text-white text-[8px] font-black uppercase rounded-md shadow-lg shadow-blue-500/20">HAMMAM</span>
                                      )}
                                    </div>
                                    <p className="text-[11px] text-gold-500/60 font-bold uppercase tracking-widest">{b.time} • {b.date}</p>
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
                                    ) : (userRole !== 'client') && (
                                      <div className="flex items-center gap-2">
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
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </motion.div>
                            );
                          })}
                        {bookings.filter(b => {
                            const isToday = b.date === format(new Date(), 'yyyy-MM-dd');
                            const isCurrentDay = b.dayName === settings.currentDay || (!b.dayName && format(parseISO(b.date), 'EEEE') === settings.currentDay);
                            return isToday || isCurrentDay;
                          }).length === 0 && (
                          <div className="py-16 bg-white/5 border border-dashed border-white/10 rounded-3xl text-center">
                            <p className="text-xs text-white/20 uppercase font-black tracking-widest">No active bookings for today</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 mb-12 max-h-80 overflow-y-auto pr-4 custom-scrollbar hidden">
                    {bookings
                      .filter(b => b.barberId === shopMain.id && (b.dayName === settings.currentDay || (!b.dayName && format(parseISO(b.date), 'EEEE') === settings.currentDay)))
                      .map((b, i) => {
                        const isToday = b.date === format(new Date(), 'yyyy-MM-dd');
                        return (
                          <motion.div 
                            key={b.id} 
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className={cn("flex items-center justify-between p-5 rounded-3xl border transition-all", isToday ? "bg-gold-500/10 border-gold-500/30 shadow-lg shadow-gold-500/5" : "bg-white/5 border-white/5 hover:border-white/10")}
                          >
                            <div className="flex items-center gap-5">
                              <span className="text-xs font-black text-gold-500/30 w-6">{String(i + 1).padStart(2, '0')}</span>
                              <div>
                                <p className="text-sm font-black tracking-wide">{b.clientName}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Clock size={10} className="text-gold-500/40" />
                                  <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">{b.time} <span className="ml-2 opacity-30">| {b.date}</span></p>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {b.status === 'completed' ? <CheckCircle2 size={20} className="text-emerald-400" /> : b.status === 'missed' ? <XCircle size={20} className="text-red-400" /> : (userRole !== 'client') && (
                                <div className="flex items-center gap-2">
                                  <motion.button whileTap={{ scale: 0.9 }} onClick={() => completeBooking(b.id)} className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-2xl hover:bg-emerald-500/20 transition-colors" title="Complete"><CheckCircle2 size={20} /></motion.button>
                                  <motion.button whileTap={{ scale: 0.9 }} onClick={() => markAsMissed(b.id)} className="p-2.5 bg-red-500/10 text-red-400 rounded-2xl hover:bg-red-500/20 transition-colors" title="Mark as Missed/Late"><X size={20} /></motion.button>
                                </div>
                              )}
                              {userRole === 'admin' && (
                                <motion.button whileTap={{ scale: 0.9 }} onClick={() => deleteBooking(b.id)} className="p-2.5 bg-red-500/10 text-red-400 rounded-2xl hover:bg-red-500/20 transition-colors"><Trash2 size={20} /></motion.button>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    {bookings.filter(b => b.barberId === shopMain.id && (b.dayName === settings.currentDay || (!b.dayName && format(parseISO(b.date), 'EEEE') === settings.currentDay))).length === 0 && (
                      <div className="text-center py-16 border-2 border-dashed border-white/5 rounded-[2.5rem]">
                        <Scissors className="mx-auto text-white/5 mb-4" size={32} />
                        <p className="text-[11px] text-white/20 uppercase tracking-[0.3em] font-black">{t.noBookings}</p>
                      </div>
                    )}
                  </div>

                  {userRole === 'client' && (
                    <motion.button 
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setBookingModal({ barberId: shopMain.id })} 
                      className="w-full py-6 bg-gradient-to-r from-gold-600 via-gold-500 to-gold-600 text-black rounded-[2rem] font-black text-xl uppercase tracking-[0.2em] shadow-[0_20px_50px_rgba(212,175,55,0.2)] hover:shadow-[0_25px_60px_rgba(212,175,55,0.3)] transition-all"
                    >
                      {t.bookNow}
                    </motion.button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}

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
                        .filter(b => b.barberId === barber.id && (b.dayName === settings.currentDay || (!b.dayName && format(parseISO(b.date), 'EEEE') === settings.currentDay)))
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
                                <p className="text-[11px] font-black tracking-wide">
                                  {b.clientName}
                                  {b.serviceType === 'hammam' && (
                                    <span className="ml-2 px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[7px] uppercase font-black">Hammam</span>
                                  )}
                                </p>
                                <p className="text-[9px] text-white/40 font-bold uppercase tracking-widest mt-0.5">{b.time}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {b.status === 'completed' ? <CheckCircle2 size={16} className="text-emerald-400" /> : b.status === 'missed' ? <XCircle size={16} className="text-red-400" /> : (userRole !== 'client' && (userRole !== 'worker' || workerId === barber.id)) && (
                                <div className="flex items-center gap-1.5">
                                  <motion.button whileTap={{ scale: 0.9 }} onClick={() => completeBooking(b.id)} className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-xl hover:bg-emerald-500/20 transition-colors" title="Complete"><CheckCircle2 size={16} /></motion.button>
                                  <motion.button whileTap={{ scale: 0.9 }} onClick={() => markAsMissed(b.id)} className="p-1.5 bg-red-500/10 text-red-400 rounded-xl hover:bg-red-500/20 transition-colors" title="Mark as Missed/Late"><X size={16} /></motion.button>
                                </div>
                              )}
                              {userRole === 'admin' && (
                                <motion.button whileTap={{ scale: 0.9 }} onClick={() => deleteBooking(b.id)} className="p-1.5 bg-red-500/10 text-red-400 rounded-xl hover:bg-red-500/20 transition-colors"><Trash2 size={16} /></motion.button>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                      {bookings.filter(b => b.barberId === barber.id && (b.dayName === settings.currentDay || (!b.dayName && format(parseISO(b.date), 'EEEE') === settings.currentDay))).length === 0 && (
                        <p className="text-center py-8 text-[10px] text-white/10 uppercase tracking-[0.2em] font-black border border-dashed border-white/5 rounded-2xl">{t.noBookings}</p>
                      )}
                    </div>
                    {userRole === 'client' && barber.status !== 'unavailable' && (
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
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50">
          <motion.button 
            whileHover={{ scale: 1.05, y: -5 }}
            whileTap={{ scale: 0.95 }}
            onClick={clearDay} 
            className="px-10 py-5 bg-red-600 text-white rounded-full font-black uppercase tracking-widest text-xs shadow-[0_20px_40px_rgba(220,38,38,0.3)] flex items-center gap-4 border border-red-500/20"
          >
            <Trash2 size={20} />
            {t.clearDay}
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
                  onClick={() => { confirmModal.onConfirm(); setConfirmModal(null); }}
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
                {shopMain && bookingModal.barberId === shopMain.id && (
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
      </AnimatePresence>
    </div>
  );
}

export default function App() { return <ErrorBoundary><BarberShop /></ErrorBoundary>; }
