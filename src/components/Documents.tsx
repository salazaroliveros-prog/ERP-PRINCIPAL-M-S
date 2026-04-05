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
import { cn, handleFirestoreError, OperationType } from '../lib/utils';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { toast } from 'sonner';
import ConfirmModal from './ConfirmModal';
import { logAction } from '../lib/audit';

export default function Documents() {
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
    folder: 'General',
    author: auth.currentUser?.displayName || auth.currentUser?.email || 'Usuario'
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'documents'), (snapshot) => {
      setDocuments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'documents'));

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'folders'), (snapshot) => {
      const fetchedFolders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (fetchedFolders.length === 0) {
        // Initialize default folders if none exist
        const defaults = [
          { name: 'Planos', color: 'text-blue-500' },
          { name: 'Finanzas', color: 'text-emerald-500' },
          { name: 'Legal', color: 'text-rose-500' },
          { name: 'Diseño', color: 'text-purple-500' },
          { name: 'General', color: 'text-slate-500' },
        ];
        defaults.forEach(async (f) => {
          await addDoc(collection(db, 'folders'), { ...f, createdAt: serverTimestamp() });
        });
      } else {
        setDbFolders(fetchedFolders);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, 'folders'));

    return () => unsubscribe();
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
        await updateDoc(doc(db, 'documents', editingDocId), {
          ...newDoc,
          updatedAt: serverTimestamp()
        });
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

        const docRef = await addDoc(collection(db, 'documents'), {
          ...newDoc,
          date: new Date().toISOString().split('T')[0],
          createdAt: serverTimestamp()
        });
        
        clearInterval(interval);
        setUploadProgress(100);
        
        setTimeout(() => {
          setIsUploading(false);
          setUploadProgress(0);
          toast.success('Documento registrado');
          logAction('Carga de Documento', 'Documentos', `Nuevo documento ${newDoc.name} cargado`, 'create', { docId: docRef.id });
          setIsModalOpen(false);
          resetForm();
        }, 500);
        return;
      }
      setIsModalOpen(false);
      resetForm();
    } catch (error) {
      setIsUploading(false);
      handleFirestoreError(error, isEditMode ? OperationType.UPDATE : OperationType.WRITE, 'documents');
    }
  };

  const resetForm = () => {
    setNewDoc({
      name: '',
      type: 'PDF',
      size: '',
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
      await deleteDoc(doc(db, 'documents', docToDelete));
      toast.success('Documento eliminado');
      await logAction('Eliminación de Documento', 'Documentos', `Documento ${d?.name} eliminado`, 'delete', { docId: docToDelete });
      setIsDeleteConfirmOpen(false);
      setDocToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'documents');
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
      await addDoc(collection(db, 'folders'), {
        name: newFolderName.trim(),
        color: 'text-slate-500',
        createdAt: serverTimestamp()
      });
      toast.success(`Carpeta "${newFolderName}" creada`);
      await logAction('Creación de Carpeta', 'Documentos', `Nueva carpeta ${newFolderName} creada`, 'create');
      setIsNewFolderModalOpen(false);
      setNewFolderName('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'folders');
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={confirmDelete}
        title="Eliminar Documento"
        message="¿Estás seguro de que deseas eliminar este documento? Esta acción no se puede deshacer."
      />
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Gestión Documental</h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium">Repositorio centralizado de archivos y planos</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsNewFolderModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-all shadow-sm"
          >
            <Plus size={18} />
            Nueva Carpeta
          </button>
          <button 
            onClick={() => {
              resetForm();
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
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
                <button onClick={() => setIsNewFolderModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                  <X size={20} className="text-slate-500" />
                </button>
              </div>
              <form onSubmit={handleCreateFolder} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre de la Carpeta</label>
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
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                  <X size={20} className="text-slate-500" />
                </button>
              </div>
              <form onSubmit={handleAddDocument} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre del Archivo</label>
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
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</label>
                    <select
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
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Carpeta</label>
                    <select
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
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tamaño (ej: 2.5 MB)</label>
                  <input
                    required
                    type="text"
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
              "p-6 bg-white dark:bg-slate-900 rounded-2xl border transition-all cursor-pointer group",
              selectedFolder === folder.name ? "border-primary ring-2 ring-primary/10 shadow-lg" : "border-slate-100 dark:border-slate-800 shadow-sm hover:border-primary"
            )}
          >
            <div className={cn("p-3 rounded-xl bg-slate-50 dark:bg-slate-800 mb-4 inline-block transition-colors group-hover:bg-primary group-hover:text-white", folder.color)}>
              <folder.icon size={24} />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">{folder.name}</h3>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{folder.count} Archivos</p>
          </motion.div>
        ))}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* File List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
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
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="Buscar archivos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-slate-800/50">
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Archivo</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Carpeta</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tamaño</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {paginatedDocuments.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {getFileIcon(doc.type)}
                          <div>
                            <p className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[200px]">{doc.name}</p>
                            <p className="text-[10px] text-slate-400 font-medium tracking-tighter">Por: {doc.author}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-full text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400">
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
                            onClick={() => toast.info(`Previsualizando ${doc.name}...`)}
                            className="p-2 text-slate-400 hover:text-primary transition-colors"
                            title="Ver"
                          >
                            <Eye size={16} />
                          </button>
                          <button 
                            onClick={() => handleEdit(doc)}
                            className="p-2 text-slate-400 hover:text-primary transition-colors"
                            title="Editar"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            onClick={() => toast.success(`Descargando ${doc.name}...`)}
                            className="p-2 text-slate-400 hover:text-primary transition-colors"
                            title="Descargar"
                          >
                            <Download size={16} />
                          </button>
                          <button 
                            onClick={() => toast.info(`Enlace de compartir copiado para ${doc.name}`)}
                            className="p-2 text-slate-400 hover:text-primary transition-colors"
                            title="Compartir"
                          >
                            <Share2 size={16} />
                          </button>
                          <button 
                            onClick={() => handleDelete(doc.id)}
                            className="p-2 text-slate-400 hover:text-rose-600 transition-colors"
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
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Página {currentPage} de {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-50 text-slate-600 dark:text-slate-400"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className="p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-50 text-slate-600 dark:text-slate-400"
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
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-6">
            <h3 className="font-black text-xs uppercase tracking-widest text-slate-900 dark:text-white mb-6 flex items-center gap-2">
              <Activity size={16} className="text-primary" />
              Almacenamiento
            </h3>
            <div className="space-y-6">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-2xl font-black text-slate-900 dark:text-white">12.4 GB</p>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Usado de 50 GB</p>
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
                      <span className="text-slate-500">{item.label}</span>
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
            className="bg-slate-900 rounded-2xl p-8 text-white border-2 border-dashed border-white/10 flex flex-col items-center justify-center text-center group cursor-pointer hover:border-primary transition-all"
          >
            <div className="p-4 bg-white/5 rounded-2xl mb-4 group-hover:bg-primary/20 transition-colors">
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
