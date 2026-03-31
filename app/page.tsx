'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { transcribeMedia, translateText, transcribeUrl } from '@/lib/gemini';
import { exportToPDF, exportToWord, exportToTXT } from '@/lib/export';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { 
  Mic, Video, Upload, Youtube, Instagram, HardDrive, 
  Download, Trash2, Languages, Clock, FileText, LogOut, 
  Plus, Search, Loader2, CheckCircle2, AlertCircle, Menu, X,
  ChevronRight, FileAudio, FileVideo, Globe, History
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { User } from '@supabase/supabase-js';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface Transcription {
  id: string;
  user_id: string;
  title: string;
  source: 'upload' | 'youtube' | 'instagram' | 'drive';
  original_text: string;
  translated_text?: string;
  language?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
  include_timestamps: boolean;
  file_url?: string;
  file_name?: string;
}

// --- Components ---

const Button = ({ 
  children, onClick, className, variant = 'primary', disabled, loading 
}: { 
  children: React.ReactNode, onClick?: () => void, className?: string, 
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline',
  disabled?: boolean, loading?: boolean
}) => {
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200',
    secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100',
    ghost: 'bg-transparent text-gray-600 hover:bg-gray-100',
    outline: 'bg-transparent border border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-600'
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        'px-4 py-2 rounded-xl font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95',
        variants[variant],
        className
      )}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : children}
    </button>
  );
};

const Card = ({ children, className }: { children: React.ReactNode, className?: string }) => (
  <div className={cn('bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden', className)}>
    {children}
  </div>
);

const Badge = ({ children, variant = 'default' }: { children: React.ReactNode, variant?: 'default' | 'success' | 'warning' | 'error' | 'info' }) => {
  const variants = {
    default: 'bg-gray-100 text-gray-600',
    success: 'bg-green-50 text-green-600',
    warning: 'bg-amber-50 text-amber-600',
    error: 'bg-red-50 text-red-600',
    info: 'bg-blue-50 text-blue-600'
  };
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider', variants[variant])}>
      {children}
    </span>
  );
};

// --- Main App ---

export default function TranscreveAI() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [selectedTranscription, setSelectedTranscription] = useState<Transcription | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Form State
  const [newTitle, setNewTitle] = useState('');
  const [newSource, setNewSource] = useState<'upload' | 'youtube' | 'instagram' | 'drive'>('upload');
  const [newUrl, setNewUrl] = useState('');
  const [newFile, setNewFile] = useState<File | null>(null);
  const [includeTimestamps, setIncludeTimestamps] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<'uploading' | 'transcribing' | 'translating' | 'idle'>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);

  // Translation State
  const [targetLang, setTargetLang] = useState('Inglês');
  const [isTranslating, setIsTranslating] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      setConfigError('Configuração do Supabase ausente. Por favor, configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY nas configurações do projeto.');
      setLoading(false);
      return;
    }

    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    }).catch(err => {
      console.error('Session check error:', err);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const fetchTranscriptions = async () => {
      const { data, error } = await supabase
        .from('transcriptions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching transcriptions:', error);
      } else {
        setTranscriptions(data as Transcription[]);
      }
    };

    fetchTranscriptions();

    // Real-time subscription
    const channel = supabase
      .channel('transcriptions_changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'transcriptions',
        filter: `user_id=eq.${user.id}`
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setTranscriptions(prev => [payload.new as Transcription, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          setTranscriptions(prev => prev.map(t => t.id === payload.new.id ? payload.new as Transcription : t));
          setSelectedTranscription(prev => prev?.id === payload.new.id ? payload.new as Transcription : prev);
        } else if (payload.eventType === 'DELETE') {
          setTranscriptions(prev => prev.filter(t => t.id === payload.old.id));
          setSelectedTranscription(prev => prev?.id === payload.old.id ? null : prev);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handleLogin = async () => {
    setAuthLoading(true);
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: origin,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        }
      });
      
      if (error) {
        console.error('Supabase Auth Error Detail:', error);
        throw error;
      }
      
      if (data?.url) {
        console.log('Redirecionando para:', data.url);
      }
    } catch (err: any) {
      console.error('Login error:', err);
      const errorMsg = err.message || 'Erro desconhecido';
      alert(`Erro de Autenticação: ${errorMsg}\n\nVerifique se:\n1. O App está "Publicado" no Google Cloud.\n2. O User Type é "External".\n3. O Client ID no Supabase está correto.`);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      alert('Por favor, preencha todos os campos.');
      return;
    }

    setAuthLoading(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        alert('Cadastro realizado! Verifique seu e-mail para confirmar (se ativado no Supabase).');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      alert(`Erro: ${err.message || 'Falha na autenticação'}`);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSelectedTranscription(null);
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setNewFile(acceptedFiles[0]);
    if (!newTitle) setNewTitle(acceptedFiles[0].name.split('.')[0]);
  }, [newTitle]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    accept: { 'video/*': [], 'audio/*': [] },
    multiple: false 
  });

  const handleCreateTranscription = async () => {
    if (!user || (!newFile && !newUrl)) return;

    // Limite de 50MB (limite padrão do Supabase Storage Free)
    const MAX_FILE_SIZE = 50 * 1024 * 1024; 
    if (newFile && newFile.size > MAX_FILE_SIZE) {
      alert('O arquivo é muito grande. O limite máximo é de 50MB. Para vídeos maiores, tente extrair apenas o áudio ou use um link do YouTube.');
      return;
    }

    setIsProcessing(true);
    setProcessingStep('uploading');
    setUploadProgress(0);

    try {
      let fileUrl = '';
      let fileNameOnStorage = '';

      if (newFile) {
        const fileExt = newFile.name.split('.').pop();
        fileNameOnStorage = `${user.id}/${Date.now()}.${fileExt}`;
        
        // Upload para o Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('transcriptions')
          .upload(fileNameOnStorage, newFile, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          if (uploadError.message.includes('maximum allowed size')) {
            throw new Error('O arquivo excede o limite de 50MB do servidor.');
          }
          throw uploadError;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('transcriptions')
          .getPublicUrl(fileNameOnStorage);
        fileUrl = publicUrl;
      }

      setProcessingStep('transcribing');
      
      // Criar registro inicial no banco
      const { data: transcriptionData, error: insertError } = await supabase
        .from('transcriptions')
        .insert({
          user_id: user.id,
          title: newTitle || (newFile ? newFile.name : 'Link Externo'),
          source: newSource,
          status: 'processing',
          include_timestamps: includeTimestamps,
          file_url: fileUrl,
          file_name: newFile?.name || '',
          original_text: 'Processando conteúdo...'
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Processar com Gemini
      let transcriptionText = '';
      const prompt = `Transcreva este conteúdo detalhadamente. Detecte o idioma automaticamente. ${includeTimestamps ? 'Inclua minutagens [00:00].' : 'Não inclua minutagens.'} Retorne apenas o texto da transcrição.`;
      
      try {
        if (newFile) {
          transcriptionText = await transcribeMedia(newFile, prompt);
        } else {
          transcriptionText = await transcribeUrl(newUrl, prompt);
        }
      } catch (geminiErr: any) {
        console.error('Gemini Error:', geminiErr);
        // Atualizar status para falha no banco
        await supabase.from('transcriptions').update({ status: 'failed', original_text: 'Erro no processamento da IA.' }).eq('id', transcriptionData.id);
        throw new Error('A IA não conseguiu processar este arquivo. Verifique se o formato é suportado.');
      }

      // Atualizar com o resultado final
      await supabase
        .from('transcriptions')
        .update({
          status: 'completed',
          original_text: transcriptionText
        })
        .eq('id', transcriptionData.id);

      setIsNewModalOpen(false);
      setNewTitle('');
      setNewFile(null);
      setNewUrl('');
      
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Erro ao processar transcrição.');
    } finally {
      setIsProcessing(false);
      setProcessingStep('idle');
    }
  };

  const handleTranslate = async () => {
    if (!selectedTranscription || !selectedTranscription.original_text) return;

    setIsTranslating(true);
    try {
      const translated = await translateText(selectedTranscription.original_text, targetLang);
      await supabase
        .from('transcriptions')
        .update({
          translated_text: translated,
          language: targetLang
        })
        .eq('id', selectedTranscription.id);
      
      setSelectedTranscription({ ...selectedTranscription, translated_text: translated, language: targetLang });
    } catch (err) {
      console.error(err);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Deseja realmente excluir esta transcrição?')) {
      await supabase
        .from('transcriptions')
        .delete()
        .eq('id', id);
      if (selectedTranscription?.id === id) setSelectedTranscription(null);
    }
  };

  const filteredTranscriptions = transcriptions.filter(t => 
    t.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (configError) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#F8FAFC] p-4 text-center">
        <div className="p-4 bg-red-50 rounded-2xl border border-red-100 max-w-md">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Configuração Necessária</h2>
          <p className="text-gray-600 mb-6">{configError}</p>
          <div className="text-left bg-white p-4 rounded-xl text-sm font-mono space-y-2 border border-red-50">
            <p>1. Vá em <span className="font-bold">Settings</span></p>
            <p>2. Adicione <span className="font-bold text-blue-600">NEXT_PUBLIC_SUPABASE_URL</span></p>
            <p>3. Adicione <span className="font-bold text-blue-600">NEXT_PUBLIC_SUPABASE_ANON_KEY</span></p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#F8FAFC] p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-8"
        >
          <div className="inline-flex p-4 bg-blue-600 rounded-3xl shadow-2xl shadow-blue-200">
            <Mic className="w-12 h-12 text-white" />
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-black tracking-tight text-gray-900">TranscreveAI</h1>
            <p className="text-gray-500 text-lg">A plataforma definitiva para transcrição e tradução inteligente de mídia.</p>
          </div>
          <Card className="p-8 space-y-6">
            <form onSubmit={handleEmailAuth} className="space-y-4 text-left">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">E-mail</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Senha</label>
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  required
                />
              </div>
              <Button 
                className="w-full py-3" 
                loading={authLoading}
              >
                {isSignUp ? 'Criar Conta' : 'Entrar'}
              </Button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-gray-500">Ou continue com</span>
              </div>
            </div>

            <Button 
              onClick={handleLogin} 
              variant="outline" 
              className="w-full py-3"
              disabled={authLoading}
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Google
            </Button>

            <p className="text-center text-sm text-gray-500">
              {isSignUp ? 'Já tem uma conta?' : 'Não tem uma conta?'}
              <button 
                onClick={() => setIsSignUp(!isSignUp)}
                className="ml-1 text-blue-600 font-bold hover:underline"
              >
                {isSignUp ? 'Entrar' : 'Cadastrar-se'}
              </button>
            </p>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="h-[100dvh] flex bg-[#F8FAFC] overflow-hidden font-sans relative">
        {/* --- Mobile Overlay --- */}
        <AnimatePresence>
          {isSidebarOpen && isMobile && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 lg:hidden"
            />
          )}
        </AnimatePresence>

        {/* --- Sidebar --- */}
        <AnimatePresence mode="wait">
          {(isSidebarOpen || !isMobile) && (
            <motion.aside 
              initial={isMobile ? { x: -320, opacity: 0 } : undefined}
              animate={{ x: 0, opacity: 1 }}
              exit={isMobile ? { x: -320, opacity: 0 } : undefined}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={cn(
                "bg-white border-r border-gray-100 flex flex-col fixed inset-y-0 left-0 z-40 w-[280px] sm:w-[320px] lg:relative lg:z-20",
                !isSidebarOpen && isMobile && "hidden"
              )}
            >
              <div className="p-6 flex items-center justify-between border-b border-gray-50">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-blue-600 rounded-lg">
                    <Mic className="w-5 h-5 text-white" />
                  </div>
                  <span className="font-bold text-xl tracking-tight">TranscreveAI</span>
                </div>
                <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="p-4 space-y-4 flex-1 overflow-y-auto">
                <Button onClick={() => { setIsNewModalOpen(true); setIsSidebarOpen(false); }} className="w-full py-3">
                  <Plus className="w-4 h-4" /> Nova Transcrição
                </Button>

                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                  <input 
                    type="text" 
                    placeholder="Buscar..." 
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-100 transition-all"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 mb-2">Recentes</p>
                  {filteredTranscriptions.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { setSelectedTranscription(t); setIsSidebarOpen(false); }}
                      className={cn(
                        'w-full p-3 rounded-xl flex items-center gap-3 transition-all text-left group',
                        selectedTranscription?.id === t.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-600'
                      )}
                    >
                      <div className={cn(
                        'p-2 rounded-lg',
                        selectedTranscription?.id === t.id ? 'bg-blue-100' : 'bg-gray-100 group-hover:bg-white'
                      )}>
                        {t.source === 'upload' ? <Upload className="w-4 h-4" /> : 
                         t.source === 'youtube' ? <Youtube className="w-4 h-4" /> :
                         t.source === 'instagram' ? <Instagram className="w-4 h-4" /> : <HardDrive className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{t.title}</p>
                        <p className="text-[10px] opacity-60">
                          {new Date(t.created_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      {t.status === 'processing' && <Loader2 className="w-3 h-3 animate-spin text-blue-400" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 border-t border-gray-50 bg-gray-50/50">
                <div className="flex items-center gap-3 p-2">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold shadow-sm">
                    {user.email?.[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{user.user_metadata?.full_name || user.email?.split('@')[0]}</p>
                    <p className="text-[10px] text-gray-400 truncate">{user.email}</p>
                  </div>
                  <button onClick={handleLogout} className="p-2 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors">
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* --- Main Content --- */}
        <main className="flex-1 flex flex-col min-w-0 relative h-full">
          {/* Header */}
          <header className="h-20 bg-white border-b border-gray-100 px-4 sm:px-8 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4 min-w-0">
              <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 hover:bg-gray-100 rounded-lg">
                <Menu className="w-5 h-5 text-gray-400" />
              </button>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 truncate">
                {selectedTranscription ? selectedTranscription.title : 'Painel de Controle'}
              </h2>
            </div>

            {selectedTranscription && selectedTranscription.status === 'completed' && (
              <div className="flex items-center gap-1 sm:gap-2">
                <div className="hidden sm:flex items-center gap-2">
                  <Button variant="outline" onClick={() => exportToPDF(selectedTranscription.title, selectedTranscription.translated_text || selectedTranscription.original_text)}>
                    <Download className="w-4 h-4" /> PDF
                  </Button>
                  <Button variant="outline" onClick={() => exportToWord(selectedTranscription.title, selectedTranscription.translated_text || selectedTranscription.original_text)}>
                    <Download className="w-4 h-4" /> Word
                  </Button>
                </div>
                <div className="sm:hidden">
                  <Button variant="outline" className="p-2" onClick={() => exportToPDF(selectedTranscription.title, selectedTranscription.translated_text || selectedTranscription.original_text)}>
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
                <Button variant="danger" className="p-2 sm:px-4" onClick={() => handleDelete(selectedTranscription.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            )}
          </header>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-8">
            <AnimatePresence mode="wait">
              {selectedTranscription ? (
                <motion.div 
                  key={selectedTranscription.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="max-w-5xl mx-auto space-y-6 sm:space-y-8"
                >
                  {/* Status & Info */}
                  <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                    <Badge variant={selectedTranscription.status === 'completed' ? 'success' : 'warning'}>
                      {selectedTranscription.status === 'completed' ? 'Concluído' : 'Processando'}
                    </Badge>
                    <div className="flex items-center gap-2 text-[10px] sm:text-xs text-gray-400">
                      <History className="w-3 h-3" />
                      {new Date(selectedTranscription.created_at).toLocaleString('pt-BR')}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] sm:text-xs text-gray-400">
                      <Clock className="w-3 h-3" />
                      {selectedTranscription.include_timestamps ? 'Com minutagem' : 'Sem minutagem'}
                    </div>
                  </div>

                  {/* Transcription Body */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
                    {/* Original */}
                    <Card className="flex flex-col h-[400px] sm:h-[600px]">
                      <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Texto Original</span>
                        <Globe className="w-4 h-4 text-gray-300" />
                      </div>
                      <div className="flex-1 p-4 sm:p-6 overflow-y-auto whitespace-pre-wrap text-gray-700 leading-relaxed text-sm">
                        {selectedTranscription.status === 'processing' ? (
                          <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
                            <Loader2 className="w-8 h-8 animate-spin" />
                            <p className="text-center">Analisando mídia e gerando transcrição...</p>
                          </div>
                        ) : (
                          selectedTranscription.original_text || 'Nenhum texto gerado.'
                        )}
                      </div>
                    </Card>

                    {/* Translation */}
                    <Card className="flex flex-col h-[400px] sm:h-[600px]">
                      <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Tradução</span>
                          {selectedTranscription.language && (
                            <Badge variant="info">{selectedTranscription.language}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <select 
                            className="text-[10px] sm:text-xs bg-white border border-gray-200 rounded px-1 sm:px-2 py-1 outline-none"
                            value={targetLang}
                            onChange={(e) => setTargetLang(e.target.value)}
                          >
                            <option>Inglês</option>
                            <option>Espanhol</option>
                            <option>Francês</option>
                            <option>Alemão</option>
                            <option>Italiano</option>
                            <option>Japonês</option>
                            <option>Chinês</option>
                          </select>
                          <Button 
                            variant="ghost" 
                            className="p-1 sm:p-1.5" 
                            onClick={handleTranslate}
                            loading={isTranslating}
                            disabled={selectedTranscription.status !== 'completed'}
                          >
                            <Languages className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex-1 p-4 sm:p-6 overflow-y-auto whitespace-pre-wrap text-gray-700 leading-relaxed text-sm bg-blue-50/10">
                        {isTranslating ? (
                          <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                            <p className="text-center">Traduzindo conteúdo...</p>
                          </div>
                        ) : (
                          selectedTranscription.translated_text || (
                            <div className="h-full flex flex-col items-center justify-center text-gray-300 italic text-center px-4 sm:px-8">
                              <Languages className="w-10 h-10 sm:w-12 sm:h-12 mb-4 opacity-20" />
                              <p className="text-xs sm:text-sm">Selecione um idioma e clique no ícone de tradução para converter o texto.</p>
                            </div>
                          )
                        )}
                      </div>
                    </Card>
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="max-w-5xl mx-auto space-y-8"
                >
                  {/* Dashboard / CRM View */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="p-6 bg-gradient-to-br from-blue-600 to-blue-700 text-white">
                      <div className="flex items-center justify-between mb-4">
                        <div className="p-2 bg-white/20 rounded-lg"><FileText className="w-5 h-5" /></div>
                        <span className="text-xs font-bold uppercase opacity-80">Total</span>
                      </div>
                      <p className="text-3xl font-black">{transcriptions.length}</p>
                      <p className="text-xs opacity-80 mt-1">Transcritos realizados</p>
                    </Card>
                    <Card className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="p-2 bg-green-50 rounded-lg"><CheckCircle2 className="w-5 h-5 text-green-600" /></div>
                        <span className="text-xs font-bold uppercase text-gray-400">Concluídos</span>
                      </div>
                      <p className="text-3xl font-black text-gray-900">{transcriptions.filter(t => t.status === 'completed').length}</p>
                      <p className="text-xs text-gray-400 mt-1">Sucesso no processamento</p>
                    </Card>
                    <Card className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="p-2 bg-amber-50 rounded-lg"><Clock className="w-5 h-5 text-amber-600" /></div>
                        <span className="text-xs font-bold uppercase text-gray-400">Em Fila</span>
                      </div>
                      <p className="text-3xl font-black text-gray-900">{transcriptions.filter(t => t.status === 'processing').length}</p>
                      <p className="text-xs text-gray-400 mt-1">Aguardando análise</p>
                    </Card>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-6">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-gray-900">Atividade Recente</h3>
                        <Button variant="ghost" className="text-xs">Ver Tudo</Button>
                      </div>
                      <div className="space-y-3">
                        {transcriptions.slice(0, 5).map(t => (
                          <button 
                            key={t.id} 
                            onClick={() => setSelectedTranscription(t)}
                            className="w-full p-4 bg-white border border-gray-100 rounded-2xl flex items-center gap-4 hover:border-blue-200 transition-all text-left group"
                          >
                            <div className="p-3 bg-gray-50 rounded-xl group-hover:bg-blue-50 transition-colors">
                              {t.source === 'upload' ? <Upload className="w-5 h-5 text-gray-400 group-hover:text-blue-600" /> : 
                               t.source === 'youtube' ? <Youtube className="w-5 h-5 text-gray-400 group-hover:text-blue-600" /> :
                               t.source === 'instagram' ? <Instagram className="w-5 h-5 text-gray-400 group-hover:text-blue-600" /> : <HardDrive className="w-5 h-5 text-gray-400 group-hover:text-blue-600" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-gray-900 truncate">{t.title}</p>
                              <p className="text-xs text-gray-400">{new Date(t.created_at).toLocaleString('pt-BR')}</p>
                            </div>
                            <Badge variant={t.status === 'completed' ? 'success' : 'warning'}>{t.status}</Badge>
                            <ChevronRight className="w-4 h-4 text-gray-300" />
                          </button>
                        ))}
                        {transcriptions.length === 0 && (
                          <div className="p-12 text-center bg-white border border-dashed border-gray-200 rounded-3xl">
                            <FileText className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                            <p className="text-gray-500">Nenhuma transcrição encontrada.</p>
                            <Button onClick={() => setIsNewModalOpen(true)} variant="outline" className="mt-4">Criar Primeira</Button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-6">
                      <h3 className="font-bold text-gray-900">Dicas Rápidas</h3>
                      <Card className="p-6 space-y-4">
                        <div className="space-y-3">
                          <div className="flex gap-3">
                            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold shrink-0">1</div>
                            <p className="text-xs text-gray-600">Use links do YouTube para transcrições rápidas de palestras.</p>
                          </div>
                          <div className="flex gap-3">
                            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold shrink-0">2</div>
                            <p className="text-xs text-gray-600">Ative a minutagem para facilitar a navegação no texto.</p>
                          </div>
                          <div className="flex gap-3">
                            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold shrink-0">3</div>
                            <p className="text-xs text-gray-600">Traduza para o Inglês para expandir seu alcance global.</p>
                          </div>
                        </div>
                        <hr className="border-gray-50" />
                        <div className="p-4 bg-blue-50 rounded-xl">
                          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-1">Suporte</p>
                          <p className="text-xs text-blue-700">Precisa de ajuda? Entre em contato com nosso time.</p>
                        </div>
                      </Card>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>

        {/* --- New Transcription Modal --- */}
        <AnimatePresence>
          {isNewModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsNewModalOpen(false)}
                className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white w-full max-w-xl rounded-3xl shadow-2xl relative z-10 overflow-hidden max-h-[90vh] flex flex-col"
              >
                <div className="p-6 sm:p-8 space-y-6 overflow-y-auto">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl sm:text-2xl font-bold text-gray-900">Nova Transcrição</h3>
                    <button onClick={() => setIsNewModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                      <X className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Título do Projeto</label>
                      <input 
                        type="text" 
                        placeholder="Ex: Reunião de Planejamento"
                        className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-blue-100 transition-all text-sm"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Fonte da Mídia</label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                          { id: 'upload', icon: Upload, label: 'Upload' },
                          { id: 'youtube', icon: Youtube, label: 'YouTube' },
                          { id: 'instagram', icon: Instagram, label: 'Insta' },
                          { id: 'drive', icon: HardDrive, label: 'Drive' }
                        ].map((s) => (
                          <button
                            key={s.id}
                            onClick={() => setNewSource(s.id as any)}
                            className={cn(
                              'flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all',
                              newSource === s.id ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-gray-50 bg-gray-50 text-gray-400 hover:border-gray-200'
                            )}
                          >
                            <s.icon className="w-5 h-5" />
                            <span className="text-[10px] font-bold uppercase">{s.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {newSource === 'upload' ? (
                      <div {...getRootProps()} className={cn(
                        'border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center transition-all cursor-pointer',
                        isDragActive ? 'border-blue-400 bg-blue-50' : 'border-gray-100 bg-gray-50 hover:border-gray-200'
                      )}>
                        <input {...getInputProps()} />
                        {newFile ? (
                          <div className="flex flex-col items-center gap-2">
                            <div className="p-3 bg-blue-100 rounded-full">
                              {newFile.type.startsWith('video') ? <FileVideo className="w-8 h-8 text-blue-600" /> : <FileAudio className="w-8 h-8 text-blue-600" />}
                            </div>
                            <p className="text-sm font-bold text-gray-700 truncate max-w-full">{newFile.name}</p>
                            <p className="text-xs text-gray-400">{(newFile.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="inline-flex p-3 bg-white rounded-xl shadow-sm">
                              <Upload className="w-6 h-6 text-gray-400" />
                            </div>
                            <p className="text-sm font-medium text-gray-600">Arraste ou clique para selecionar</p>
                            <p className="text-[10px] text-gray-400 uppercase tracking-wider">MP4, MP3, WAV, MOV (Máx 50MB)</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Link da Mídia</label>
                        <div className="relative">
                          <Globe className="w-4 h-4 absolute left-4 top-4 text-gray-400" />
                          <input 
                            type="url" 
                            placeholder="https://..."
                            className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-blue-100 transition-all text-sm"
                            value={newUrl}
                            onChange={(e) => setNewUrl(e.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                      <div className="flex items-center gap-3">
                        <Clock className="w-5 h-5 text-gray-400" />
                        <div>
                          <p className="text-sm font-bold text-gray-700">Incluir Minutagem</p>
                          <p className="text-[10px] text-gray-400">Adiciona marcações de tempo no texto</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => setIncludeTimestamps(!includeTimestamps)}
                        className={cn(
                          'w-12 h-6 rounded-full transition-all relative',
                          includeTimestamps ? 'bg-blue-600' : 'bg-gray-200'
                        )}
                      >
                        <div className={cn(
                          'w-4 h-4 bg-white rounded-full absolute top-1 transition-all',
                          includeTimestamps ? 'right-1' : 'left-1'
                        )} />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 pt-2">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button variant="secondary" className="w-full py-3 order-2 sm:order-1" onClick={() => setIsNewModalOpen(false)}>
                        Cancelar
                      </Button>
                      <Button 
                        className="w-full py-3 order-1 sm:order-2" 
                        onClick={handleCreateTranscription}
                        loading={isProcessing}
                        disabled={!newTitle || (!newFile && !newUrl)}
                      >
                        {processingStep === 'uploading' ? 'Enviando...' :
                         processingStep === 'transcribing' ? 'IA Transcrevendo...' :
                         'Iniciar Transcrição'}
                      </Button>
                    </div>
                    {isProcessing && (
                      <div className="space-y-2">
                        <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: processingStep === 'uploading' ? '40%' : '80%' }}
                            className="h-full bg-blue-600"
                          />
                        </div>
                        <p className="text-center text-[10px] font-bold text-blue-600 uppercase tracking-widest animate-pulse">
                          {processingStep === 'uploading' ? 'Enviando arquivo para o servidor...' : 
                           'Aguarde, a IA está analisando o conteúdo...'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}
