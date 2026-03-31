'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Music, FileText, ListMusic, Plus, Search, 
  Download, Share2, Trash2, Edit3, Save, 
  ChevronRight, ChevronLeft, Upload, FileDown,
  ArrowRightLeft, Palette, Check, X, Copy, CheckCircle2,
  Printer, MessageCircle, Menu, LogOut, Bell, Calendar,
  Key, Settings, User, Mail, Lock, Eye, EyeOff, AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { saveAs } from 'file-saver';
import { auth, db } from '../lib/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut,
  updateProfile
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  orderBy,
  setDoc,
  getDoc
} from 'firebase/firestore';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface Song {
  id: string;
  uid: string;
  title: string;
  artist: string;
  content: string;
  type: 'chord' | 'lyric';
  key: string;
  originalKey: string;
  createdAt?: any;
}

interface Setlist {
  id: string;
  uid: string;
  name: string;
  date: string;
  songs: string[]; // IDs of songs
  createdAt?: any;
}

interface Notice {
  id: string;
  uid: string;
  title: string;
  content: string;
  date: string;
  type: 'aviso' | 'escala';
  createdAt?: any;
}

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  accidentalPreference: 'mixed' | 'sharps' | 'flats';
}

// --- Constants ---
const SHARP_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const MIXED_NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

const ALL_KEYS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];

const getBestNoteName = (index: number, preference: 'mixed' | 'sharps' | 'flats'): string => {
  const normalizedIndex = (index % 12 + 12) % 12;
  if (preference === 'sharps') return SHARP_NOTES[normalizedIndex];
  if (preference === 'flats') return FLAT_NOTES[normalizedIndex];
  return MIXED_NOTES[normalizedIndex];
};

// --- Utils ---
const transposeChord = (chord: string, semitones: number, preference: 'mixed' | 'sharps' | 'flats'): string => {
  const match = chord.match(/^([A-G][b#]?)(.*)$/);
  if (!match) return chord;
  
  let note = match[1];
  const suffix = match[2];
  
  // Normalize to sharp for indexing
  const sharpIndex = SHARP_NOTES.indexOf(note);
  const flatIndex = FLAT_NOTES.indexOf(note);
  const index = sharpIndex !== -1 ? sharpIndex : flatIndex;
  
  if (index === -1) return chord;
  
  const newIndex = (index + semitones) % 12;
  return getBestNoteName(newIndex, preference) + suffix;
};

const transposeContent = (content: string, semitones: number, preference: 'mixed' | 'sharps' | 'flats'): string => {
  const chordRegex = /\b[A-G][b#]?(m|maj|min|aug|dim|sus|add|2|4|5|6|7|9|11|13)*(\/[A-G][b#]?)?\b/g;
  return content.replace(chordRegex, (match) => {
    if (match.includes('/')) {
      const [base, bass] = match.split('/');
      return transposeChord(base, semitones, preference) + '/' + transposeChord(bass, semitones, preference);
    }
    return transposeChord(match, semitones, preference);
  });
};

const highlightChords = (text: string) => {
  const chordRegex = /(\b[A-G][b#]?(?:m|maj|min|aug|dim|sus|add|2|4|5|6|7|9|11|13)*(?:\/[A-G][b#]?)?\b)/g;
  const parts = text.split(chordRegex);
  
  return parts.map((part, i) => {
    if (part.match(chordRegex)) {
      return <span key={i} className="text-blue-600 font-bold bg-blue-50 px-1 rounded">{part}</span>;
    }
    return part;
  });
};

// --- Main Component ---
export default function WorshipApp() {
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [activeTab, setActiveTab] = useState<'chords' | 'lyrics' | 'setlists' | 'notices'>('chords');
  const [songs, setSongs] = useState<Song[]>([]);
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNoticeModalOpen, setIsNoticeModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isKeySelectorOpen, setIsKeySelectorOpen] = useState(false);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [editingNotice, setEditingNotice] = useState<Notice | null>(null);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [selectedSetlist, setSelectedSetlist] = useState<Setlist | null>(null);
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);
  const [selectedSongIds, setSelectedSongIds] = useState<string[]>([]);

  // Form State - Songs
  const [formTitle, setFormTitle] = useState('');
  const [formArtist, setFormArtist] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formKey, setFormKey] = useState('C');
  const [formType, setFormType] = useState<'chord' | 'lyric'>('chord');

  // Form State - Notices
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeContent, setNoticeContent] = useState('');
  const [noticeType, setNoticeType] = useState<'aviso' | 'escala'>('aviso');

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setUserProfile(docSnap.data() as UserProfile);
        } else {
          const newProfile: UserProfile = {
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || '',
            accidentalPreference: 'mixed'
          };
          await setDoc(docRef, newProfile);
          setUserProfile(newProfile);
        }
      } else {
        setUserProfile(null);
      }
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Data Listeners
  useEffect(() => {
    if (!user) {
      setSongs([]);
      setSetlists([]);
      setNotices([]);
      return;
    }

    const songsQuery = query(collection(db, 'songs'), where('uid', '==', user.uid), orderBy('createdAt', 'desc'));
    const setlistsQuery = query(collection(db, 'setlists'), where('uid', '==', user.uid), orderBy('createdAt', 'desc'));
    const noticesQuery = query(collection(db, 'notices'), where('uid', '==', user.uid), orderBy('createdAt', 'desc'));

    const unsubSongs = onSnapshot(songsQuery, (snap) => {
      setSongs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Song)));
    });
    const unsubSetlists = onSnapshot(setlistsQuery, (snap) => {
      setSetlists(snap.docs.map(d => ({ id: d.id, ...d.data() } as Setlist)));
    });
    const unsubNotices = onSnapshot(noticesQuery, (snap) => {
      setNotices(snap.docs.map(d => ({ id: d.id, ...d.data() } as Notice)));
    });

    return () => {
      unsubSongs();
      unsubSetlists();
      unsubNotices();
    };
  }, [user]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const res = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(res.user, { displayName });
      }
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const handleLogout = async () => {
    if (confirm('Deseja sair do sistema?')) {
      await signOut(auth);
      setSelectedSong(null);
      setSelectedSetlist(null);
      setSelectedNotice(null);
    }
  };

  const updateAccidentalPreference = async (pref: 'mixed' | 'sharps' | 'flats') => {
    if (!user) return;
    const docRef = doc(db, 'users', user.uid);
    await updateDoc(docRef, { accidentalPreference: pref });
    setUserProfile(prev => prev ? { ...prev, accidentalPreference: pref } : null);
  };

  const filteredSongs = useMemo(() => songs.filter(s => 
    s.type === (activeTab === 'chords' ? 'chord' : 'lyric') &&
    (s.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
     s.artist.toLowerCase().includes(searchQuery.toLowerCase()))
  ), [songs, activeTab, searchQuery]);

  const handleSaveSong = async () => {
    if (!formTitle || !formContent || !user) return;

    const songData = {
      uid: user.uid,
      title: formTitle,
      artist: formArtist,
      content: formContent,
      type: formType,
      key: formKey,
      originalKey: editingSong?.originalKey || formKey,
      createdAt: editingSong?.createdAt || serverTimestamp()
    };

    if (editingSong) {
      await updateDoc(doc(db, 'songs', editingSong.id), songData);
    } else {
      await addDoc(collection(db, 'songs'), songData);
    }

    closeModal();
  };

  const handleSaveNotice = async () => {
    if (!noticeTitle || !noticeContent || !user) return;

    const noticeData = {
      uid: user.uid,
      title: noticeTitle,
      content: noticeContent,
      type: noticeType,
      date: new Date().toLocaleDateString('pt-BR'),
      createdAt: editingNotice?.createdAt || serverTimestamp()
    };

    if (editingNotice) {
      await updateDoc(doc(db, 'notices', editingNotice.id), noticeData);
    } else {
      await addDoc(collection(db, 'notices'), noticeData);
    }

    closeNoticeModal();
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingSong(null);
    setFormTitle('');
    setFormArtist('');
    setFormContent('');
    setFormKey('C');
  };

  const closeNoticeModal = () => {
    setIsNoticeModalOpen(false);
    setEditingNotice(null);
    setNoticeTitle('');
    setNoticeContent('');
  };

  const openEditModal = (song: Song) => {
    setEditingSong(song);
    setFormTitle(song.title);
    setFormArtist(song.artist);
    setFormContent(song.content);
    setFormKey(song.key);
    setFormType(song.type);
    setIsModalOpen(true);
  };

  const openNoticeEditModal = (notice: Notice) => {
    setEditingNotice(notice);
    setNoticeTitle(notice.title);
    setNoticeContent(notice.content);
    setNoticeType(notice.type);
    setIsNoticeModalOpen(true);
  };

  const handleDeleteSong = async (id: string) => {
    if (confirm('Deseja excluir esta música?')) {
      await deleteDoc(doc(db, 'songs', id));
      if (selectedSong?.id === id) setSelectedSong(null);
    }
  };

  const handleDeleteNotice = async (id: string) => {
    if (confirm('Deseja excluir este aviso/escala?')) {
      await deleteDoc(doc(db, 'notices', id));
      if (selectedNotice?.id === id) setSelectedNotice(null);
    }
  };

  const handleTranspose = (semitones: number) => {
    if (!selectedSong) return;
    
    const currentIndex = SHARP_NOTES.indexOf(selectedSong.key.replace('Db', 'C#').replace('Eb', 'D#').replace('Gb', 'F#').replace('Ab', 'G#').replace('Bb', 'A#'));
    let newIndex = (currentIndex + semitones) % 12;
    if (newIndex < 0) newIndex += 12;
    
    const targetKey = getBestNoteName(newIndex, userProfile?.accidentalPreference || 'mixed');
    const newContent = transposeContent(selectedSong.content, semitones, userProfile?.accidentalPreference || 'mixed');
    
    const updatedSong = {
      ...selectedSong,
      content: newContent,
      key: targetKey
    };
    
    setSelectedSong(updatedSong);
    updateDoc(doc(db, 'songs', selectedSong.id), { content: newContent, key: targetKey });
  };

  const handleQuickKeyChange = (newKey: string) => {
    if (!selectedSong) return;
    
    const currentIndex = SHARP_NOTES.indexOf(selectedSong.key.replace('Db', 'C#').replace('Eb', 'D#').replace('Gb', 'F#').replace('Ab', 'G#').replace('Bb', 'A#'));
    const targetIndex = SHARP_NOTES.indexOf(newKey.replace('Db', 'C#').replace('Eb', 'D#').replace('Gb', 'F#').replace('Ab', 'G#').replace('Bb', 'A#'));
    
    if (currentIndex === -1 || targetIndex === -1) return;
    
    let semitones = targetIndex - currentIndex;
    const newContent = transposeContent(selectedSong.content, semitones, userProfile?.accidentalPreference || 'mixed');
    
    const updatedSong = {
      ...selectedSong,
      content: newContent,
      key: newKey
    };
    
    setSelectedSong(updatedSong);
    updateDoc(doc(db, 'songs', selectedSong.id), { content: newContent, key: newKey });
    setIsKeySelectorOpen(false);
  };

  // Export Functions
  const exportTXT = (song: Song) => {
    const blob = new Blob([`${song.title} - ${song.artist}\nTom: ${song.key}\n\n${song.content}`], { type: 'text/plain' });
    saveAs(blob, `${song.title}.txt`);
  };

  const exportPDF = (song: Song) => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text(song.title, 20, 20);
    doc.setFontSize(12);
    doc.text(song.artist, 20, 30);
    doc.text(`Tom: ${song.key}`, 20, 40);
    doc.setFont('courier');
    doc.text(song.content, 20, 55);
    doc.save(`${song.title}.pdf`);
  };

  const exportWord = async (song: Song) => {
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({ children: [new TextRun({ text: song.title, bold: true, size: 32 })] }),
          new Paragraph({ children: [new TextRun({ text: song.artist, size: 24 })] }),
          new Paragraph({ children: [new TextRun({ text: `Tom: ${song.key}`, size: 20 })] }),
          new Paragraph({ children: [new TextRun({ text: "" })] }),
          ...song.content.split('\n').map(line => new Paragraph({ children: [new TextRun({ text: line, font: 'Courier New' })] }))
        ],
      }],
    });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${song.title}.docx`);
  };

  const shareWhatsApp = (song: Song) => {
    const text = `*${song.title} - ${song.artist}*\nTom: ${song.key}\n\n${song.content}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const shareNoticeWhatsApp = (notice: Notice) => {
    const text = `*${notice.title}*\nData: ${notice.date}\n\n${notice.content}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const exportNoticeTXT = (notice: Notice) => {
    const blob = new Blob([`${notice.title}\nData: ${notice.date}\n\n${notice.content}`], { type: 'text/plain' });
    saveAs(blob, `${notice.title}.txt`);
  };

  const handleImportTXT = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      const songData = {
        uid: user.uid,
        title: file.name.replace('.txt', ''),
        artist: 'Importado',
        content: content,
        type: activeTab === 'chords' ? 'chord' : 'lyric',
        key: 'C',
        originalKey: 'C',
        createdAt: serverTimestamp()
      };
      await addDoc(collection(db, 'songs'), songData);
    };
    reader.readAsText(file);
  };

  // Setlist Functions
  const handleCreateSetlist = async () => {
    const name = prompt('Nome do Setlist:');
    if (!name || !user) return;
    await addDoc(collection(db, 'setlists'), {
      uid: user.uid,
      name,
      date: new Date().toLocaleDateString('pt-BR'),
      songs: [],
      createdAt: serverTimestamp()
    });
  };

  const handleDeleteSetlist = async (id: string) => {
    if (confirm('Deseja excluir este setlist?')) {
      await deleteDoc(doc(db, 'setlists', id));
      if (selectedSetlist?.id === id) setSelectedSetlist(null);
    }
  };

  const handleEditSetlist = async (sl: Setlist) => {
    const newName = prompt('Novo nome do Setlist:', sl.name);
    if (!newName) return;
    await updateDoc(doc(db, 'setlists', sl.id), { name: newName });
  };

  const addToSetlist = async (songId: string, setlistId: string) => {
    const sl = setlists.find(s => s.id === setlistId);
    if (sl && !sl.songs.includes(songId)) {
      await updateDoc(doc(db, 'setlists', setlistId), { songs: [...sl.songs, songId] });
    }
  };

  const removeFromSetlist = async (songId: string, setlistId: string) => {
    const sl = setlists.find(s => s.id === setlistId);
    if (sl) {
      await updateDoc(doc(db, 'setlists', setlistId), { songs: sl.songs.filter(id => id !== songId) });
    }
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white rounded-3xl shadow-xl shadow-blue-100 overflow-hidden"
        >
          <div className="p-8 text-center bg-blue-600 text-white">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Music className="w-10 h-10" />
            </div>
            <h1 className="text-3xl font-black tracking-tight">WorshipApp</h1>
            <p className="text-blue-100 mt-2">Gestão de louvor simplificada</p>
          </div>

          <div className="p-8">
            <form onSubmit={handleAuth} className="space-y-4">
              {authMode === 'register' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Nome</label>
                  <div className="relative">
                    <User className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                      type="text" 
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-100 transition-all"
                      placeholder="Seu nome"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Email</label>
                <div className="relative">
                  <Mail className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                    type="email" 
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-100 transition-all"
                    placeholder="seu@email.com"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Senha</label>
                <div className="relative">
                  <Lock className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                    type={showPassword ? "text" : "password"} 
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-12 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-100 transition-all"
                    placeholder="••••••••"
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {authError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 text-red-600 rounded-xl text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <p>{authError}</p>
                </div>
              )}

              <button 
                type="submit"
                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 mt-4"
              >
                {authMode === 'login' ? 'Entrar' : 'Criar Conta'}
              </button>
            </form>

            <div className="mt-8 text-center">
              <p className="text-gray-400 text-sm">
                {authMode === 'login' ? 'Não tem uma conta?' : 'Já tem uma conta?'}
                <button 
                  onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                  className="text-blue-600 font-bold ml-2 hover:underline"
                >
                  {authMode === 'login' ? 'Cadastre-se' : 'Entrar'}
                </button>
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 flex flex-col lg:flex-row h-screen overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 flex flex-col transition-transform duration-300 lg:relative lg:translate-x-0 shrink-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <Music className="w-6 h-6" />
            </div>
            <h1 className="font-black text-xl tracking-tight">WorshipApp</h1>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 hover:bg-gray-100 rounded-xl">
            <X className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4 overflow-y-auto">
          {[
            { id: 'chords', icon: Music, label: 'Cifras' },
            { id: 'lyrics', icon: FileText, label: 'Letras' },
            { id: 'setlists', icon: ListMusic, label: 'Setlists' },
            { id: 'notices', icon: Bell, label: 'Avisos & Escala' }
          ].map(item => (
            <button
              key={item.id}
              onClick={() => { 
                setActiveTab(item.id as any); 
                setSelectedSong(null); 
                setSelectedSetlist(null); 
                setSelectedNotice(null);
                setSelectedSongIds([]);
                setIsSidebarOpen(false);
              }}
              className={cn(
                'w-full flex items-center gap-3 p-3 rounded-xl transition-all group',
                activeTab === item.id ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
              )}
            >
              <item.icon className={cn('w-6 h-6', activeTab === item.id ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600')} />
              <span className="font-bold">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 p-3 rounded-xl text-red-400 hover:bg-red-50 hover:text-red-600 transition-all"
          >
            <LogOut className="w-6 h-6" />
            <span className="font-bold">Sair</span>
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-gray-50 h-full">
        {/* Header */}
        <header className="h-20 bg-white border-b border-gray-200 px-4 lg:px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4 flex-1 max-w-xl">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 hover:bg-gray-100 rounded-xl">
              <Menu className="w-6 h-6 text-gray-400" />
            </button>
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                placeholder={`Buscar...`}
                className="w-full pl-10 pr-4 py-2 bg-gray-100 border-none rounded-xl focus:ring-2 focus:ring-blue-100 transition-all text-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 lg:gap-3 ml-4">
            {activeTab !== 'setlists' && activeTab !== 'notices' && filteredSongs.length > 0 && (
              <button 
                onClick={() => {
                  if (selectedSongIds.length === filteredSongs.length) {
                    setSelectedSongIds([]);
                  } else {
                    setSelectedSongIds(filteredSongs.map(s => s.id));
                  }
                }}
                className={cn(
                  "p-2 rounded-xl transition-all border",
                  selectedSongIds.length === filteredSongs.length ? "bg-blue-50 border-blue-200 text-blue-600" : "bg-white border-gray-200 text-gray-400 hover:bg-gray-50"
                )}
                title={selectedSongIds.length === filteredSongs.length ? "Desmarcar todos" : "Selecionar todos"}
              >
                <CheckCircle2 className="w-5 h-5" />
              </button>
            )}
            {activeTab !== 'setlists' && activeTab !== 'notices' && (
              <label className="cursor-pointer bg-white border border-gray-200 p-2 rounded-xl hover:bg-gray-50 transition-all shadow-sm">
                <Upload className="w-5 h-5 text-gray-600" />
                <input type="file" accept=".txt" className="hidden" onChange={handleImportTXT} />
              </label>
            )}
            <button 
              onClick={() => {
                if (activeTab === 'setlists') handleCreateSetlist();
                else if (activeTab === 'notices') setIsNoticeModalOpen(true);
                else setIsModalOpen(true);
              }}
              className="bg-blue-600 text-white px-3 lg:px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">Novo</span>
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
          {/* List */}
          <div className={cn(
            "w-full lg:w-80 border-r border-gray-200 overflow-y-auto bg-white/50 h-full",
            (selectedSong || selectedSetlist || selectedNotice) ? "hidden lg:block" : "block"
          )}>
            {activeTab === 'setlists' ? (
              <div className="p-4 space-y-3">
                {setlists.map(sl => (
                  <button
                    key={sl.id}
                    onClick={() => setSelectedSetlist(sl)}
                    className={cn(
                      'w-full p-4 rounded-2xl border transition-all text-left group',
                      selectedSetlist?.id === sl.id ? 'border-blue-200 bg-blue-50' : 'border-transparent bg-white hover:border-gray-200'
                    )}
                  >
                    <p className="font-bold text-gray-900">{sl.name}</p>
                    <p className="text-xs text-gray-400 mt-1">{sl.date} • {sl.songs.length} músicas</p>
                  </button>
                ))}
              </div>
            ) : activeTab === 'notices' ? (
              <div className="p-4 space-y-3">
                {notices.map(notice => (
                  <button
                    key={notice.id}
                    onClick={() => setSelectedNotice(notice)}
                    className={cn(
                      'w-full p-4 rounded-2xl border transition-all text-left group',
                      selectedNotice?.id === notice.id ? 'border-blue-200 bg-blue-50' : 'border-transparent bg-white hover:border-gray-200'
                    )}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-gray-900">{notice.title}</p>
                        <p className="text-xs text-gray-400">{notice.date}</p>
                      </div>
                      <span className={cn(
                        "text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-wider",
                        notice.type === 'aviso' ? "bg-amber-100 text-amber-600" : "bg-purple-100 text-purple-600"
                      )}>
                        {notice.type}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {selectedSongIds.length > 0 && (
                  <div className="bg-blue-600 p-4 rounded-2xl text-white space-y-3 shadow-lg shadow-blue-200 animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-black uppercase tracking-widest">{selectedSongIds.length} selecionados</p>
                      <button onClick={() => setSelectedSongIds([])} className="p-1 hover:bg-white/20 rounded-lg transition-all"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="relative group">
                      <button className="w-full bg-white text-blue-600 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-blue-50 transition-all">
                        <Plus className="w-4 h-4" /> Add ao Setlist
                      </button>
                      <div className="absolute left-0 bottom-full mb-2 w-full bg-white border border-gray-200 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 p-2">
                        {setlists.map(sl => (
                          <button 
                            key={sl.id}
                            onClick={() => {
                              selectedSongIds.forEach(id => addToSetlist(id, sl.id));
                              setSelectedSongIds([]);
                            }}
                            className="w-full text-left p-2 hover:bg-blue-50 rounded-lg text-xs font-medium text-gray-700"
                          >
                            {sl.name}
                          </button>
                        ))}
                        {setlists.length === 0 && <p className="text-[10px] text-gray-400 p-2 text-center">Nenhum setlist criado</p>}
                      </div>
                    </div>
                  </div>
                )}
                {filteredSongs.map(song => (
                  <div key={song.id} className="relative group">
                    <button
                      onClick={() => setSelectedSong(song)}
                      className={cn(
                        'w-full p-4 rounded-2xl border transition-all text-left flex items-start gap-3',
                        selectedSong?.id === song.id ? 'border-blue-200 bg-blue-50' : 'border-transparent bg-white hover:border-gray-200'
                      )}
                    >
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSongIds(prev => 
                            prev.includes(song.id) ? prev.filter(id => id !== song.id) : [...prev, song.id]
                          );
                        }}
                        className={cn(
                          "w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all shrink-0 mt-0.5",
                          selectedSongIds.includes(song.id) ? "bg-blue-600 border-blue-600 text-white" : "border-gray-200 bg-white"
                        )}
                      >
                        {selectedSongIds.includes(song.id) && <Check className="w-3 h-3" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                          <div className="truncate">
                            <p className="font-bold text-gray-900 truncate">{song.title}</p>
                            <p className="text-xs text-gray-400 truncate">{song.artist}</p>
                          </div>
                          {song.type === 'chord' && (
                            <span className="text-[10px] font-black bg-blue-100 text-blue-600 px-2 py-1 rounded-lg uppercase tracking-wider shrink-0">
                              {song.key}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Viewer */}
          <div className={cn(
            "flex-1 overflow-y-auto p-4 lg:p-8 bg-white h-full",
            (!selectedSong && !selectedSetlist && !selectedNotice) ? "hidden lg:flex" : "flex"
          )}>
            {selectedSong ? (
              <div className="w-full max-w-3xl mx-auto space-y-8">
                <div className="flex items-center justify-between border-b border-gray-100 pb-6">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setSelectedSong(null)} className="lg:hidden p-2 hover:bg-gray-100 rounded-xl">
                      <ChevronLeft className="w-6 h-6 text-gray-400" />
                    </button>
                    <div>
                      <h2 className="text-2xl lg:text-3xl font-black text-gray-900">{selectedSong.title}</h2>
                      <p className="text-gray-400 font-medium">{selectedSong.artist}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEditModal(selectedSong)} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-600"><Edit3 className="w-5 h-5" /></button>
                    <button onClick={() => handleDeleteSong(selectedSong.id)} className="p-2 hover:bg-red-50 rounded-xl text-gray-400 hover:text-red-600"><Trash2 className="w-5 h-5" /></button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 py-4 bg-gray-50 px-4 lg:px-6 rounded-2xl">
                  {selectedSong.type === 'chord' && (
                    <div className="flex items-center gap-3 border-r border-gray-200 pr-4">
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Tom</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleTranspose(-1)} className="p-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-100"><ChevronLeft className="w-4 h-4" /></button>
                        <div className="relative">
                          <button 
                            onClick={() => setIsKeySelectorOpen(!isKeySelectorOpen)}
                            className="w-12 py-1 text-center font-black text-blue-600 bg-white border border-blue-100 rounded-lg hover:bg-blue-50 transition-all"
                          >
                            {selectedSong.key}
                          </button>
                          <AnimatePresence>
                            {isKeySelectorOpen && (
                              <>
                                <div className="fixed inset-0 z-10" onClick={() => setIsKeySelectorOpen(false)} />
                                <motion.div 
                                  initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.9, y: 10 }}
                                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-white border border-gray-200 rounded-2xl shadow-2xl z-20 p-3 grid grid-cols-4 gap-1"
                                >
                                  {ALL_KEYS.map(k => (
                                    <button 
                                      key={k}
                                      onClick={() => handleQuickKeyChange(k)}
                                      className={cn(
                                        "p-2 text-xs font-bold rounded-lg transition-all",
                                        selectedSong.key === k ? "bg-blue-600 text-white" : "hover:bg-gray-100 text-gray-600"
                                      )}
                                    >
                                      {k}
                                    </button>
                                  ))}
                                </motion.div>
                              </>
                            )}
                          </AnimatePresence>
                        </div>
                        <button onClick={() => handleTranspose(1)} className="p-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-100"><ChevronRight className="w-4 h-4" /></button>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <button onClick={() => exportTXT(selectedSong)} className="p-2 hover:bg-white rounded-lg text-gray-500" title="TXT"><FileDown className="w-5 h-5" /></button>
                    <button onClick={() => exportPDF(selectedSong)} className="p-2 hover:bg-white rounded-lg text-gray-500" title="PDF"><Printer className="w-5 h-5" /></button>
                    <button onClick={() => exportWord(selectedSong)} className="p-2 hover:bg-white rounded-lg text-gray-500" title="Word"><Save className="w-5 h-5" /></button>
                    <button onClick={() => shareWhatsApp(selectedSong)} className="p-2 hover:bg-white rounded-lg text-green-600" title="WhatsApp"><MessageCircle className="w-5 h-5" /></button>
                  </div>
                  <div className="flex-1" />
                  
                  {/* Accidental Preference Selector */}
                  <div className="flex items-center bg-white border border-gray-200 rounded-xl p-1">
                    {[
                      { id: 'mixed', label: '1', title: 'C#, Eb, F#, Ab, Bb' },
                      { id: 'sharps', label: '2', title: 'C#, D#, F#, G#, A#' },
                      { id: 'flats', label: '3', title: 'Db, Eb, Gb, Ab, Bb' }
                    ].map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => updateAccidentalPreference(opt.id as any)}
                        title={opt.title}
                        className={cn(
                          "px-3 py-1 text-[10px] font-black rounded-lg transition-all",
                          userProfile?.accidentalPreference === opt.id ? "bg-blue-600 text-white" : "text-gray-400 hover:bg-gray-50"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <div className="relative group">
                    <button className="bg-white border border-gray-200 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2">
                      <Plus className="w-4 h-4" /> Add ao Setlist
                    </button>
                    <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 p-2">
                      {setlists.map(sl => (
                        <button 
                          key={sl.id}
                          onClick={() => addToSetlist(selectedSong.id, sl.id)}
                          className="w-full text-left p-2 hover:bg-blue-50 rounded-lg text-xs font-medium"
                        >
                          {sl.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 lg:p-8 rounded-3xl font-mono text-sm leading-relaxed overflow-x-auto whitespace-pre">
                  {selectedSong.type === 'chord' ? highlightChords(selectedSong.content) : selectedSong.content}
                </div>
              </div>
            ) : selectedSetlist ? (
              <div className="w-full max-w-3xl mx-auto space-y-8">
                <div className="flex items-center justify-between border-b border-gray-100 pb-6">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setSelectedSetlist(null)} className="lg:hidden p-2 hover:bg-gray-100 rounded-xl">
                      <ChevronLeft className="w-6 h-6 text-gray-400" />
                    </button>
                    <div>
                      <h2 className="text-2xl lg:text-3xl font-black text-gray-900">{selectedSetlist.name}</h2>
                      <p className="text-gray-400 font-medium">{selectedSetlist.date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleEditSetlist(selectedSetlist)} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-600" title="Editar Nome"><Edit3 className="w-5 h-5" /></button>
                    <button onClick={() => handleDeleteSetlist(selectedSetlist.id)} className="p-2 hover:bg-red-50 rounded-xl text-gray-400 hover:text-red-600" title="Excluir Setlist"><Trash2 className="w-5 h-5" /></button>
                    <button 
                      onClick={() => {
                        const text = `*Setlist: ${selectedSetlist.name}*\nData: ${selectedSetlist.date}\n\n` + 
                          selectedSetlist.songs.map((id, i) => {
                            const s = songs.find(x => x.id === id);
                            return `${i+1}. ${s?.title} (${s?.key})`;
                          }).join('\n');
                        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                      }}
                      className="bg-green-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-green-700 transition-all ml-2"
                    >
                      <MessageCircle className="w-5 h-5" /> Compartilhar
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  {selectedSetlist.songs.map((songId, index) => {
                    const song = songs.find(s => s.id === songId);
                    if (!song) return null;
                    return (
                      <div key={songId} className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl group">
                        <span className="w-8 h-8 bg-white rounded-lg flex items-center justify-center font-black text-blue-600 shadow-sm">{index + 1}</span>
                        <div className="flex-1">
                          <p className="font-bold text-gray-900">{song.title}</p>
                          <p className="text-xs text-gray-400">{song.artist} • {song.key}</p>
                        </div>
                        <button onClick={() => setSelectedSong(song)} className="p-2 hover:bg-white rounded-lg text-gray-400 hover:text-blue-600"><ChevronRight className="w-5 h-5" /></button>
                        <button onClick={() => removeFromSetlist(songId, selectedSetlist.id)} className="p-2 hover:bg-white rounded-lg text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all"><X className="w-5 h-5" /></button>
                      </div>
                    );
                  })}
                  {selectedSetlist.songs.length === 0 && (
                    <div className="text-center py-12 border-2 border-dashed border-gray-100 rounded-3xl">
                      <ListMusic className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                      <p className="text-gray-400">Adicione músicas a este setlist</p>
                    </div>
                  )}
                </div>
              </div>
            ) : selectedNotice ? (
              <div className="w-full max-w-3xl mx-auto space-y-8">
                <div className="flex items-center justify-between border-b border-gray-100 pb-6">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setSelectedNotice(null)} className="lg:hidden p-2 hover:bg-gray-100 rounded-xl">
                      <ChevronLeft className="w-6 h-6 text-gray-400" />
                    </button>
                    <div>
                      <h2 className="text-2xl lg:text-3xl font-black text-gray-900">{selectedNotice.title}</h2>
                      <p className="text-gray-400 font-medium">{selectedNotice.date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openNoticeEditModal(selectedNotice)} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-600"><Edit3 className="w-5 h-5" /></button>
                    <button onClick={() => handleDeleteNotice(selectedNotice.id)} className="p-2 hover:bg-red-50 rounded-xl text-gray-400 hover:text-red-600"><Trash2 className="w-5 h-5" /></button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 py-4 bg-gray-50 px-4 lg:px-6 rounded-2xl">
                  <div className="flex items-center gap-2">
                    <button onClick={() => exportNoticeTXT(selectedNotice)} className="p-2 hover:bg-white rounded-lg text-gray-500" title="TXT"><FileDown className="w-5 h-5" /></button>
                    <button onClick={() => shareNoticeWhatsApp(selectedNotice)} className="p-2 hover:bg-white rounded-lg text-green-600" title="WhatsApp"><MessageCircle className="w-5 h-5" /></button>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 lg:p-8 rounded-3xl font-sans text-sm lg:text-base leading-relaxed overflow-x-auto whitespace-pre-wrap">
                  {selectedNotice.content}
                </div>
              </div>
            ) : (
              <div className="h-full w-full flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-20 h-20 bg-gray-50 rounded-3xl flex items-center justify-center text-gray-200">
                  <Music className="w-10 h-10" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Selecione um item</h3>
                  <p className="text-gray-400">Escolha uma música, setlist ou aviso para visualizar</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Song Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 lg:p-8 space-y-6 overflow-y-auto">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-black text-gray-900">{editingSong ? 'Editar Música' : 'Nova Música'}</h3>
                  <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-xl"><X className="w-6 h-6 text-gray-400" /></button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Título</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-blue-100 transition-all"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Artista</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-blue-100 transition-all"
                      value={formArtist}
                      onChange={(e) => setFormArtist(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tipo</label>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setFormType('chord')}
                        className={cn(
                          'flex-1 py-3 rounded-xl font-bold text-sm border-2 transition-all',
                          formType === 'chord' ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-gray-50 bg-gray-50 text-gray-400'
                        )}
                      >
                        Cifra
                      </button>
                      <button 
                        onClick={() => setFormType('lyric')}
                        className={cn(
                          'flex-1 py-3 rounded-xl font-bold text-sm border-2 transition-all',
                          formType === 'lyric' ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-gray-50 bg-gray-50 text-gray-400'
                        )}
                      >
                        Letra
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tom Original</label>
                    <select 
                      className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-blue-100 transition-all"
                      value={formKey}
                      onChange={(e) => setFormKey(e.target.value)}
                    >
                      {ALL_KEYS.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Conteúdo (Cifra ou Letra)</label>
                  <textarea 
                    className="w-full h-48 lg:h-64 px-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-100 transition-all font-mono text-sm leading-relaxed"
                    placeholder="Cole aqui a cifra ou letra..."
                    value={formContent}
                    onChange={(e) => setFormContent(e.target.value)}
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button onClick={closeModal} className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-all">Cancelar</button>
                  <button onClick={handleSaveSong} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200">Salvar Música</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Notice Modal */}
      <AnimatePresence>
        {isNoticeModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeNoticeModal}
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 lg:p-8 space-y-6 overflow-y-auto">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-black text-gray-900">{editingNotice ? 'Editar Aviso/Escala' : 'Novo Aviso/Escala'}</h3>
                  <button onClick={closeNoticeModal} className="p-2 hover:bg-gray-100 rounded-xl"><X className="w-6 h-6 text-gray-400" /></button>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Título</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-blue-100 transition-all"
                    value={noticeTitle}
                    onChange={(e) => setNoticeTitle(e.target.value)}
                    placeholder="Ex: Escala de Domingo"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tipo</label>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setNoticeType('aviso')}
                      className={cn(
                        'flex-1 py-3 rounded-xl font-bold text-sm border-2 transition-all',
                        noticeType === 'aviso' ? 'border-amber-600 bg-amber-50 text-amber-600' : 'border-gray-50 bg-gray-50 text-gray-400'
                      )}
                    >
                      Aviso
                    </button>
                    <button 
                      onClick={() => setNoticeType('escala')}
                      className={cn(
                        'flex-1 py-3 rounded-xl font-bold text-sm border-2 transition-all',
                        noticeType === 'escala' ? 'border-purple-600 bg-purple-50 text-purple-600' : 'border-gray-50 bg-gray-50 text-gray-400'
                      )}
                    >
                      Escala
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Conteúdo</label>
                  <textarea 
                    className="w-full h-48 lg:h-64 px-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-100 transition-all font-sans text-sm lg:text-base leading-relaxed"
                    placeholder="Escreva aqui os avisos ou a escala..."
                    value={noticeContent}
                    onChange={(e) => setNoticeContent(e.target.value)}
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button onClick={closeNoticeModal} className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-all">Cancelar</button>
                  <button onClick={handleSaveNotice} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200">Salvar</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
