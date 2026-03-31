'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Music, FileText, ListMusic, Plus, Search, 
  Download, Share2, Trash2, Edit3, Save, 
  ChevronRight, ChevronLeft, Upload, FileDown,
  ArrowRightLeft, Palette, Check, X, Copy,
  Printer, MessageCircle, Menu, LogOut, Bell, Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { saveAs } from 'file-saver';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface Song {
  id: string;
  title: string;
  artist: string;
  content: string;
  type: 'chord' | 'lyric';
  key: string;
  originalKey: string;
}

interface Setlist {
  id: string;
  name: string;
  date: string;
  songs: string[]; // IDs of songs
}

interface Notice {
  id: string;
  title: string;
  content: string;
  date: string;
  type: 'aviso' | 'escala';
}

// --- Constants ---
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS: Record<string, string> = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' };

// --- Utils ---
const transposeChord = (chord: string, semitones: number): string => {
  const match = chord.match(/^([A-G][b#]?)(.*)$/);
  if (!match) return chord;
  
  let note = match[1];
  const suffix = match[2];
  
  if (FLATS[note]) note = FLATS[note];
  
  const index = NOTES.indexOf(note);
  if (index === -1) return chord;
  
  let newIndex = (index + semitones) % 12;
  if (newIndex < 0) newIndex += 12;
  
  return NOTES[newIndex] + suffix;
};

const transposeContent = (content: string, semitones: number): string => {
  const chordRegex = /\b[A-G][b#]?(m|maj|min|aug|dim|sus|add|2|4|5|6|7|9|11|13)*(\/[A-G][b#]?)?\b/g;
  return content.replace(chordRegex, (match) => {
    if (match.includes('/')) {
      const [base, bass] = match.split('/');
      return transposeChord(base, semitones) + '/' + transposeChord(bass, semitones);
    }
    return transposeChord(match, semitones);
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
  const [activeTab, setActiveTab] = useState<'chords' | 'lyrics' | 'setlists' | 'notices'>('chords');
  const [songs, setSongs] = useState<Song[]>([]);
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNoticeModalOpen, setIsNoticeModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [editingNotice, setEditingNotice] = useState<Notice | null>(null);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [selectedSetlist, setSelectedSetlist] = useState<Setlist | null>(null);
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);

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

  // Load Initial Data
  useEffect(() => {
    const savedSongs = localStorage.getItem('worship_songs');
    const savedSetlists = localStorage.getItem('worship_setlists');
    const savedNotices = localStorage.getItem('worship_notices');
    if (savedSongs) setSongs(JSON.parse(savedSongs));
    if (savedSetlists) setSetlists(JSON.parse(savedSetlists));
    if (savedNotices) setNotices(JSON.parse(savedNotices));
  }, []);

  // Save Data
  useEffect(() => {
    localStorage.setItem('worship_songs', JSON.stringify(songs));
    localStorage.setItem('worship_setlists', JSON.stringify(setlists));
    localStorage.setItem('worship_notices', JSON.stringify(notices));
  }, [songs, setlists, notices]);

  const filteredSongs = songs.filter(s => 
    s.type === (activeTab === 'chords' ? 'chord' : 'lyric') &&
    (s.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
     s.artist.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleSaveSong = () => {
    if (!formTitle || !formContent) return;

    const newSong: Song = {
      id: editingSong?.id || Date.now().toString(),
      title: formTitle,
      artist: formArtist,
      content: formContent,
      type: formType,
      key: formKey,
      originalKey: editingSong?.originalKey || formKey
    };

    if (editingSong) {
      setSongs(songs.map(s => s.id === editingSong.id ? newSong : s));
      if (selectedSong?.id === editingSong.id) setSelectedSong(newSong);
    } else {
      setSongs([newSong, ...songs]);
    }

    closeModal();
  };

  const handleSaveNotice = () => {
    if (!noticeTitle || !noticeContent) return;

    const newNotice: Notice = {
      id: editingNotice?.id || Date.now().toString(),
      title: noticeTitle,
      content: noticeContent,
      type: noticeType,
      date: new Date().toLocaleDateString('pt-BR')
    };

    if (editingNotice) {
      setNotices(notices.map(n => n.id === editingNotice.id ? newNotice : n));
      if (selectedNotice?.id === editingNotice.id) setSelectedNotice(newNotice);
    } else {
      setNotices([newNotice, ...notices]);
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

  const handleDeleteSong = (id: string) => {
    if (confirm('Deseja excluir esta música?')) {
      setSongs(songs.filter(s => s.id !== id));
      if (selectedSong?.id === id) setSelectedSong(null);
    }
  };

  const handleDeleteNotice = (id: string) => {
    if (confirm('Deseja excluir este aviso/escala?')) {
      setNotices(notices.filter(n => n.id !== id));
      if (selectedNotice?.id === id) setSelectedNotice(null);
    }
  };

  const handleLogout = () => {
    if (confirm('Deseja sair do sistema?')) {
      // For now, just clear and reload
      localStorage.clear();
      window.location.reload();
    }
  };

  const handleTranspose = (semitones: number) => {
    if (!selectedSong) return;
    const newContent = transposeContent(selectedSong.content, semitones);
    const currentIndex = NOTES.indexOf(selectedSong.key);
    let newIndex = (currentIndex + semitones) % 12;
    if (newIndex < 0) newIndex += 12;
    
    const updatedSong = {
      ...selectedSong,
      content: newContent,
      key: NOTES[newIndex]
    };
    
    setSelectedSong(updatedSong);
    setSongs(songs.map(s => s.id === selectedSong.id ? updatedSong : s));
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

  const handleImportTXT = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setFormContent(content);
      setFormTitle(file.name.replace('.txt', ''));
      setFormType(activeTab === 'chords' ? 'chord' : 'lyric');
      setIsModalOpen(true);
    };
    reader.readAsText(file);
  };

  // Setlist Functions
  const handleCreateSetlist = () => {
    const name = prompt('Nome do Setlist:');
    if (!name) return;
    const newSetlist: Setlist = {
      id: Date.now().toString(),
      name,
      date: new Date().toLocaleDateString('pt-BR'),
      songs: []
    };
    setSetlists([newSetlist, ...setlists]);
  };

  const addToSetlist = (songId: string, setlistId: string) => {
    setSetlists(setlists.map(sl => {
      if (sl.id === setlistId && !sl.songs.includes(songId)) {
        return { ...sl, songs: [...sl.songs, songId] };
      }
      return sl;
    }));
  };

  const removeFromSetlist = (songId: string, setlistId: string) => {
    setSetlists(setlists.map(sl => {
      if (sl.id === setlistId) {
        return { ...sl, songs: sl.songs.filter(id => id !== songId) };
      }
      return sl;
    }));
  };

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
                {filteredSongs.map(song => (
                  <button
                    key={song.id}
                    onClick={() => setSelectedSong(song)}
                    className={cn(
                      'w-full p-4 rounded-2xl border transition-all text-left group',
                      selectedSong?.id === song.id ? 'border-blue-200 bg-blue-50' : 'border-transparent bg-white hover:border-gray-200'
                    )}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-gray-900">{song.title}</p>
                        <p className="text-xs text-gray-400">{song.artist}</p>
                      </div>
                      {song.type === 'chord' && (
                        <span className="text-[10px] font-black bg-blue-100 text-blue-600 px-2 py-1 rounded-lg uppercase tracking-wider">
                          {song.key}
                        </span>
                      )}
                    </div>
                  </button>
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
                        <span className="w-8 text-center font-black text-blue-600">{selectedSong.key}</span>
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
                  <button 
                    onClick={() => {
                      const text = `*Setlist: ${selectedSetlist.name}*\nData: ${selectedSetlist.date}\n\n` + 
                        selectedSetlist.songs.map((id, i) => {
                          const s = songs.find(x => x.id === id);
                          return `${i+1}. ${s?.title} (${s?.key})`;
                        }).join('\n');
                      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                    }}
                    className="bg-green-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-green-700 transition-all"
                  >
                    <MessageCircle className="w-5 h-5" /> Compartilhar
                  </button>
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
                      {NOTES.map(n => <option key={n} value={n}>{n}</option>)}
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
