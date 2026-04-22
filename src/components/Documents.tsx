import React, { useState, useMemo, useEffect } from 'react';
import { 
  FileText, 
  Folder, 
  Upload, 
  Search, 
  Filter, 
  MoreVertical, 
  Download, 
  Eye, 
  Trash2, 
  Clock, 
  ChevronRight,
  ChevronLeft,
  FileCode,
  FileImage,
  FileArchive,
  Plus,
  Share2,
  Activity,
  X,
  Edit2,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { auth } from '../lib/authStorageClient';
import { toast } from 'sonner';
import ConfirmModal from './ConfirmModal';
import { logAction } from '../lib/audit';
import {
  listDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
  listFolders,
  createFolder,
} from '../lib/documentsApi';

export default function Documents() {
  const projectCardEffectClass = 'rounded-theme shadow-(--shadow-theme) border border-slate-100 dark:border-slate-800 hover:shadow-lg hover:border-primary/30 transition-all duration-500';
  const getFolderHoverClass = (folderColor: string) => {
    if (folderColor.includes('blue')) return 'hover:border-blue-300 dark:hover:border-blue-500/40';
    if (folderColor.includes('emerald')) return 'hover:border-emerald-300 dark:hover:border-emerald-500/40';
    if (folderColor.includes('rose')) return 'hover:border-rose-300 dark:hover:border-rose-500/40';
    if (folderColor.includes('purple')) return 'hover:border-purple-300 dark:hover:border-purple-500/40';
    return 'hover:border-slate-300 dark:hover:border-slate-600';
  };

  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [docToDelete, setDocToDelete] = useState<string | null>(null);
  const [isNewFolderModalOpen, setIsNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [dbFolders, setDbFolders] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [newDoc, setNewDoc] = useState({
    name: '',
    type: 'PDF',
    size: '',
    fileUrl: '',
    folder: 'General',
    author: auth.currentUser?.displayName || auth.currentUser?.email || 'Usuario'
  });

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const [docs, folders] = await Promise.all([listDocuments(), listFolders()]);
        if (cancelled) return;

        setDocuments(docs);
        if (folders.length > 0) {
          setDbFolders(folders);
        } else {
          const defaults = [
            { name: 'Planos', color: 'text-blue-500' },
            { name: 'Finanzas', color: 'text-emerald-500' },
            { name: 'Legal', color: 'text-rose-500' },
            { name: 'Diseno', color: 'text-purple-500' },
            { name: 'General', color: 'text-slate-500' },
          ];

          const created = await Promise.all(defaults.map((f) => createFolder(f)));
          if (!cancelled) setDbFolders(created);
        }
      } catch (error: any) {
        if (!cancelled) {
          toast.error(error?.message || 'No se pudieron cargar documentos');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

  const folders = useMemo(() => {
    const counts: { [key: string]: number } = {};
    documents.forEach(d => {
      counts[d.folder] = (counts[d.folder] || 0) + 1;
    });
    
    return dbFolders.map(f => ({
      ...f,
      count: counts[f.name] || 0,
      icon: Folder
    }));
  }, [documents, dbFolders]);

  const filteredDocuments = useMemo(() => {
    return documents.filter(doc => 
      (doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.folder.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.author.toLowerCase().includes(searchTerm.toLowerCase())) &&
      (!selectedFolder || doc.folder === selectedFolder)
    );
  }, [documents, searchTerm, selectedFolder]);

  const totalPages = Math.ceil(filteredDocuments.length / itemsPerPage);
  const paginatedDocuments = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredDocuments.slice(start, start + itemsPerPage);
  }, [filteredDocuments, currentPage, itemsPerPage]);

  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isEditMode && editingDocId) {
        const updated = await updateDocument(editingDocId, {
          name: newDoc.name,
          type: newDoc.type,
          size: newDoc.size,
          fileUrl: newDoc.fileUrl,
          folder: newDoc.folder,
          author: newDoc.author,
        });
        setDocuments((prev) => prev.map((d) => (d.id === editingDocId ? updated : d)));
        toast.success('Documento actualizado');
        await logAction('Edición de Documento', 'Documentos', `Documento ${newDoc.name} actualizado`, 'update', { docId: editingDocId });
      } else {
        setIsUploading(true);
        setUploadProgress(0);
        
        // Simulate upload progress
        const interval = setInterval(() => {
          setUploadProgress(prev => {
            if (prev >= 95) {
              clearInterval(interval);
              return 95;
            }
            return prev + 5;
          });
        }, 100);

        const created = await createDocument({
          ...newDoc,
          date: new Date().toISOString().split('T')[0],
        });
        setDocuments((prev) => [created, ...prev]);
        
        clearInterval(interval);
        setUploadProgress(100);
        
        setTimeout(() => {
          setIsUploading(false);
          setUploadProgress(0);
          toast.success('Documento registrado');
          logAction('Carga de Documento', 'Documentos', `Nuevo documento ${newDoc.name} cargado`, 'create', { docId: created.id });
          setIsModalOpen(false);
          resetForm();
        }, 500);
        return;
      }
      setIsModalOpen(false);
      resetForm();
    } catch (error: any) {
      setIsUploading(false);
      toast.error(error?.message || 'No se pudo guardar el documento');
    }
  };

  const resetForm = () => {
    setNewDoc({
      name: '',
      type: 'PDF',
      size: '',
      fileUrl: '',
      folder: 'General',
      author: auth.currentUser?.displayName || auth.currentUser?.email || 'Usuario'
    });
    setIsEditMode(false);
    setEditingDocId(null);
  };

  const handleEdit = (d: any) => {
    setNewDoc({
      name: d.name,
      type: d.type,
      size: d.size,
      fileUrl: d.fileUrl || '',
      folder: d.folder,
      author: d.author
    });
    setEditingDocId(d.id);
    setIsEditMode(true);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    setDocToDelete(id);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!docToDelete) return;
    try {
      const d = documents.find(doc => doc.id === docToDelete);
      await deleteDocument(docToDelete);
      setDocuments((prev) => prev.filter((doc) => doc.id !== docToDelete));
      toast.success('Documento eliminado');
      await logAction('Eliminación de Documento', 'Documentos', `Documento ${d?.name} eliminado`, 'delete', { docId: docToDelete });
      setIsDeleteConfirmOpen(false);
      setDocToDelete(null);
    } catch (error: any) {
      toast.error(error?.message || 'No se pudo eliminar el documento');
    }
  };

  const openDocumentFile = (doc: any) => {
    if (!doc.fileUrl) {
      toast.info(`El documento ${doc.name} no tiene archivo adjunto`);
      return;
    }

    if (String(doc.fileUrl).startsWith('data:')) {
      try {
        const dataUrl = String(doc.fileUrl);
        const [meta, content] = dataUrl.split(',', 2);
        if (!meta || !content) throw new Error('Formato data URL inválido');

        const mimeMatch = meta.match(/^data:([^;]+);base64$/i);
        const mimeType = mimeMatch?.[1] || 'application/octet-stream';
        const bytes = Uint8Array.from(atob(content), (char) => char.charCodeAt(0));
        const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
        window.open(blobUrl, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
        return;
      } catch {
        toast.error(`No se pudo abrir ${doc.name}`);
        return;
      }
    }

    window.open(doc.fileUrl, '_blank', 'noopener,noreferrer');
  };

  const downloadDocumentFile = (doc: any) => {
    if (!doc.fileUrl) {
      toast.info(`El documento ${doc.name} no tiene archivo descargable`);
      return;
    }

    const link = document.createElement('a');

    if (String(doc.fileUrl).startsWith('data:')) {
      try {
        const dataUrl = String(doc.fileUrl);
        const [meta, content] = dataUrl.split(',', 2);
        if (!meta || !content) throw new Error('Formato data URL inválido');

        const mimeMatch = meta.match(/^data:([^;]+);base64$/i);
        const mimeType = mimeMatch?.[1] || 'application/octet-stream';
        const bytes = Uint8Array.from(atob(content), (char) => char.charCodeAt(0));
        const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
        link.href = blobUrl;
        link.download = doc.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 5_000);
        toast.success(`Descargando ${doc.name}...`);
        return;
      } catch {
        toast.error(`No se pudo descargar ${doc.name}`);
        return;
      }
    }

    link.href = doc.fileUrl;
    link.download = doc.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Descargando ${doc.name}...`);
  };

  const shareDocumentFile = async (doc: any) => {
    if (!doc.fileUrl) {
      toast.info(`El documento ${doc.name} no tiene enlace para compartir`);
      return;
    }

    try {
      await navigator.clipboard.writeText(doc.fileUrl);
      toast.success(`Enlace copiado para ${doc.name}`);
    } catch {
      toast.error('No se pudo copiar el enlace');
    }
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'PDF': return <FileText className="text-rose-500" size={20} />;
      case 'Excel': return <FileCode className="text-emerald-500" size={20} />;
      case 'Word': return <FileText className="text-blue-500" size={20} />;
      case 'Image': return <FileImage className="text-purple-500" size={20} />;
      default: return <FileArchive className="text-slate-500" size={20} />;
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      const created = await createFolder({
        name: newFolderName.trim(),
        color: 'text-slate-500',
      });
      setDbFolders((prev) => {
        if (prev.some((f) => f.name === created.name)) {
          return prev.map((f) => (f.name === created.name ? created : f));
        }
        return [...prev, created].sort((a, b) => a.name.localeCompare(b.name));
      });
      toast.success(`Carpeta "${newFolderName}" creada`);
      await logAction('Creación de Carpeta', 'Documentos', `Nueva carpeta ${newFolderName} creada`, 'create');
      setIsNewFolderModalOpen(false);
      setNewFolderName('');
    } catch (error: any) {
      toast.error(error?.message || 'No se pudo crear la carpeta');
    }
  };

  return (
    <div className="space-y-5 sm:space-y-8 pb-20">
      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={confirmDelete}
        title="Eliminar Documento"
        message="¿Estás seguro de que deseas eliminar este documento? Esta acción no se puede deshacer."
      />
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Gestión Documental</h1>
          <p className="text-[11px] sm:text-base text-slate-500 dark:text-slate-300 font-medium">Repositorio centralizado de archivos y planos</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button 
            onClick={() => setIsNewFolderModalOpen(true)}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-[11px] sm:text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-all duration-200 shadow-sm min-h-9 sm:min-h-0 active:scale-105 active:ring-2 active:ring-primary/30 focus-visible:scale-105 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            <Plus size={18} />
            Nueva Carpeta
          </button>
          <button 
            onClick={() => {
              resetForm();
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-primary text-white rounded-xl text-[11px] sm:text-sm font-bold hover:bg-primary/90 transition-all duration-200 shadow-lg shadow-primary/20 min-h-9 sm:min-h-0 active:scale-105 active:ring-2 active:ring-primary/35 focus-visible:scale-105 focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:outline-none"
          >
            <Upload size={18} />
            Subir Archivo
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isNewFolderModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100 dark:border-slate-800"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="text-xl font-black text-slate-900 dark:text-white">Nueva Carpeta</h3>
                <button
                  onClick={() => setIsNewFolderModalOpen(false)}
                  aria-label="Cerrar modal de nueva carpeta"
                  title="Cerrar"
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  <X size={20} className="text-slate-500 dark:text-slate-300" />
                </button>
              </div>
              <form onSubmit={handleCreateFolder} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">Nombre de la Carpeta</label>
                  <input
                    required
                    autoFocus
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    placeholder="ej: Facturas 2024"
                  />
                </div>
                <button type="submit" className="w-full py-4 bg-primary text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all mt-4">
                  Crear Carpeta
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100 dark:border-slate-800"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="text-xl font-black text-slate-900 dark:text-white">
                  {isEditMode ? 'Editar Documento' : 'Subir Archivo'}
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  aria-label="Cerrar modal de documento"
                  title="Cerrar"
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  <X size={20} className="text-slate-500 dark:text-slate-300" />
                </button>
              </div>
              <form onSubmit={handleAddDocument} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">Nombre del Archivo</label>
                  <input
                    required
                    type="text"
                    value={newDoc.name}
                    onChange={(e) => setNewDoc({ ...newDoc, name: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    placeholder="ej: Planos_Estructurales.pdf"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">Tipo</label>
                    <select
                      aria-label="Tipo de archivo"
                      title="Tipo de archivo"
                      value={newDoc.type}
                      onChange={(e) => setNewDoc({ ...newDoc, type: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    >
                      <option value="PDF">PDF</option>
                      <option value="Excel">Excel</option>
                      <option value="Word">Word</option>
                      <option value="Image">Imagen</option>
                      <option value="Archive">Archivo</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">Carpeta</label>
                    <select
                      aria-label="Carpeta del documento"
                      title="Carpeta del documento"
                      value={newDoc.folder}
                      onChange={(e) => setNewDoc({ ...newDoc, folder: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    >
                      {dbFolders.map(f => (
                        <option key={f.id} value={f.name}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">Tamaño (ej: 2.5 MB)</label>
                  <input
                    required
                    type="text"
                    aria-label="Tamano del archivo"
                    title="Tamano del archivo"
                    placeholder="ej: 2.5 MB"
                    value={newDoc.size}
                    onChange={(e) => setNewDoc({ ...newDoc, size: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  />
                </div>
                <button 
                  type="submit" 
                  disabled={isUploading}
                  className="w-full py-4 bg-primary text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all mt-4 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Subiendo... {(uploadProgress || 0).toFixed(1)}%
                    </>
                  ) : (
                    isEditMode ? 'Guardar Cambios' : 'Subir Archivo'
                  )}
                </button>
                {isUploading && (
                  <div className="w-full h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-2">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${uploadProgress}%` }}
                      className="h-full bg-primary"
                    />
                  </div>
                )}
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Folders Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {folders.map((folder, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 }}
            onClick={() => setSelectedFolder(folder.name)}
            className={cn(
              "p-6 bg-white dark:bg-slate-900 glass-card cursor-pointer group",
              projectCardEffectClass,
              getFolderHoverClass(folder.color),
              selectedFolder === folder.name ? "border-primary ring-2 ring-primary/10 shadow-lg" : ""
            )}
          >
            <div className={cn("p-3 rounded-xl bg-slate-50 dark:bg-slate-800 mb-4 inline-block transition-all duration-200 sm:duration-300 group-hover:bg-primary group-hover:text-white group-hover:scale-105 sm:group-hover:scale-110 group-hover:shadow-md sm:group-hover:shadow-lg group-hover:shadow-primary/20", folder.color)}>
              <folder.icon size={24} />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">{folder.name}</h3>
            <p className="text-[10px] text-slate-400 dark:text-slate-300 font-black uppercase tracking-widest">{folder.count} Archivos</p>
          </motion.div>
        ))}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-8 min-w-0">
        {/* File List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white dark:bg-slate-900 glass-card rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden min-w-0">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
              <div className="flex items-center gap-4">
                <h3 className="font-black text-xs uppercase tracking-widest text-slate-900 dark:text-white">
                  {selectedFolder ? `Archivos en ${selectedFolder}` : 'Todos los Archivos'}
                </h3>
                {selectedFolder && (
                  <button 
                    onClick={() => setSelectedFolder(null)}
                    className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline"
                  >
                    Ver Todos
                  </button>
                )}
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-300" size={16} />
                <input
                  type="text"
                  placeholder="Buscar archivos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] sm:text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                />
              </div>
            </div>
            <div className="overflow-x-auto lg:overflow-x-hidden">
              <table className="w-full text-left border-collapse table-fixed">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-slate-800/50">
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">Archivo</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">Carpeta</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">Tamaño</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">Fecha</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {paginatedDocuments.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {getFileIcon(doc.type)}
                          <div>
                            <p className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-50">{doc.name}</p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-300 font-medium tracking-tighter">Por: {doc.author}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-full text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">
                          {doc.folder}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400">
                        {doc.size}
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400">
                        {doc.date}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => openDocumentFile(doc)}
                            className="p-2 text-slate-400 dark:text-slate-300 hover:text-primary transition-colors"
                            title="Ver"
                          >
                            <Eye size={16} />
                          </button>
                          <button 
                            onClick={() => handleEdit(doc)}
                            className="p-2 text-slate-400 dark:text-slate-300 hover:text-primary transition-colors"
                            title="Editar"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            onClick={() => downloadDocumentFile(doc)}
                            className="p-2 text-slate-400 dark:text-slate-300 hover:text-primary transition-colors"
                            title="Descargar"
                          >
                            <Download size={16} />
                          </button>
                          <button 
                            onClick={() => void shareDocumentFile(doc)}
                            className="p-2 text-slate-400 dark:text-slate-300 hover:text-primary transition-colors"
                            title="Compartir"
                          >
                            <Share2 size={16} />
                          </button>
                          <button 
                            onClick={() => handleDelete(doc.id)}
                            className="p-2 text-slate-400 dark:text-slate-300 hover:text-rose-600 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/30 dark:bg-slate-800/30">
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest">
                  Página {currentPage} de {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    aria-label="Pagina anterior"
                    title="Pagina anterior"
                    className="p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-50 text-slate-600 dark:text-slate-300"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    aria-label="Pagina siguiente"
                    title="Pagina siguiente"
                    className="p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-50 text-slate-600 dark:text-slate-300"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Widgets */}
        <div className="space-y-6">
          {/* Storage Usage */}
          <div className={cn("bg-white dark:bg-slate-900 glass-card p-6 group", projectCardEffectClass)}>
            <h3 className="font-black text-xs uppercase tracking-widest text-slate-900 dark:text-white mb-6 flex items-center gap-2">
              <Activity size={16} className="text-primary transition-transform duration-200 sm:duration-300 group-hover:scale-110" />
              Almacenamiento
            </h3>
            <div className="space-y-6">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-2xl font-black text-slate-900 dark:text-white">12.4 GB</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-300 font-black uppercase tracking-widest">Usado de 50 GB</p>
                </div>
                <span className="text-xs font-black text-primary">24.8%</span>
              </div>
              <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: '24.8%' }}
                  transition={{ duration: 1 }}
                  className="h-full bg-primary rounded-full"
                />
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Documentos', size: '8.2 GB', color: 'bg-blue-500' },
                  { label: 'Imágenes', size: '3.1 GB', color: 'bg-purple-500' },
                  { label: 'Otros', size: '1.1 GB', color: 'bg-slate-400' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-2 h-2 rounded-full", item.color)} />
                      <span className="text-slate-500 dark:text-slate-300">{item.label}</span>
                    </div>
                    <span className="text-slate-900 dark:text-white">{item.size}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Upload */}
          <div 
            onClick={() => {
              resetForm();
              setIsModalOpen(true);
            }}
            className="bg-slate-900 glass-card rounded-theme shadow-(--shadow-theme) p-8 text-white border-2 border-dashed border-white/10 flex flex-col items-center justify-center text-center group cursor-pointer hover:border-primary hover:shadow-lg transition-all duration-500"
          >
            <div className="p-4 bg-white/5 rounded-2xl mb-4 group-hover:bg-primary/20 group-hover:scale-105 sm:group-hover:scale-110 group-hover:shadow-md sm:group-hover:shadow-lg group-hover:shadow-primary/20 transition-all duration-200 sm:duration-300">
              <Upload size={32} className="text-primary" />
            </div>
            <h3 className="text-sm font-black uppercase tracking-widest mb-2">Subida Rápida</h3>
            <p className="text-[10px] opacity-50 font-medium">Arrastra y suelta tus archivos aquí para subirlos al instante.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
