"use client";
import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import { Clock, ChefHat, CheckCircle, LogOut, MessageCircle, Lock, Trash2, UtensilsCrossed, AlertTriangle, Store, Power, PlusCircle, Edit3, X, Image as ImageIcon, FileText, LayoutGrid } from 'lucide-react';
import Image from 'next/image';

import { 
  getDashboardData, fetchMenuOnly, updateOrderStatusAction, fetchOrdersOnly,
  deleteOrderAction, toggleSoldOutAction, deleteProductAction, 
  saveProductAction, toggleStoreOpenAction, uploadImageAction 
} from '../controllers/adminController';

interface OrderItem {
  name: string;
  variantName: string | null;
  price: number;
  quantity: number;
}

interface Order {
  id: string;
  customer_name: string;
  customer_phone: string;
  items: OrderItem[];
  total: number;
  status: 'Pendiente' | 'Preparando' | 'Listo' | 'Completado';
  created_at: string;
}

interface MenuVariant {
  name: string;
  description: string;
  price: string;
  image?: string;
  imageFile?: File | null;
}

interface MenuProduct {
  id: number;
  name: string;
  category: string;
  image: string;
  description?: string;
  price?: string;
  variants?: MenuVariant[];
  is_sold_out: boolean;
}

export default function AdminDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuProducts, setMenuProducts] = useState<MenuProduct[]>([]);
  const [isOpen, setIsOpen] = useState(true);

  const [inventoryFilter, setInventoryFilter] = useState<'todos' | 'comida' | 'bebidas'>('todos');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('comida');
  const [hasVariants, setHasVariants] = useState(false);
  const [newPrice, setNewPrice] = useState('$85 MXN');
  const [newDesc, setNewDesc] = useState('');
  const [variantsList, setVariantsList] = useState<MenuVariant[]>([
    { name: 'Relleno Clásico', description: '', price: '$85 MXN', image: '', imageFile: null }
  ]);
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [currentImageUrl, setImageUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [modalConfig, setModalConfig] = useState<{ 
    show: boolean; title: string; message: string; confirmText?: string; isDestructive?: boolean; onConfirm: () => void 
  } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500); 
  };

  const [activeTab, setActiveTab] = useState<'pedidos' | 'menu' | 'config'>('pedidos');
  const [loadingApp, setLoadingApp] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const router = useRouter();

  // 1. CARGA INICIAL COMPLETA (Se ejecuta 1 vez al abrir la página)
  const fetchInitialData = async () => {
    try {
      const [ordersRes, menuRes, configRes] = await Promise.all([
        supabase.from('orders').select('*').neq('status', 'Completado').order('created_at', { ascending: true }),
        supabase.from('menu_items').select('*').order('id', { ascending: true }),
        supabase.from('store_config').select('*').eq('key', 'is_open').single()
      ]);
      
      if (ordersRes.data) setOrders(ordersRes.data as Order[]);
      if (menuRes.data) setMenuProducts(menuRes.data as MenuProduct[]);
      if (configRes.data) setIsOpen(configRes.data.value === 'true' || configRes.data.value === true);
    } catch (error) {
      showToast("Error al cargar los datos", "error");
    } finally {
      setLoadingApp(false);
    }
  };

  // 2. EFECTO MAESTRO: Arquitectura Híbrida a prueba de fallos
  useEffect(() => {
    const verifySecurity = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
        return;
      }
      setIsAuthorized(true);
      await fetchInitialData();
    };

    verifySecurity();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        setIsAuthorized(false);
        router.replace('/login');
      }
    });

    // --- SISTEMA DE RESCATE (SMART POLLING) ---
    // Consulta silenciosa cada 3 segundos. Garantiza que la cocina SIEMPRE reciba 
    // la orden, incluso si el navegador bloquea los WebSockets.
    const syncDataBackground = async () => {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .neq('status', 'Completado')
        .order('created_at', { ascending: true });

      if (data) {
        setOrders(currentOrders => {
          // Comparamos el contenido para evitar parpadeos en la pantalla
          const isDifferent = JSON.stringify(currentOrders) !== JSON.stringify(data);
          if (isDifferent) {
            // Si la nueva lista es más grande, disparamos la alerta visual
            if (data.length > currentOrders.length) {
              showToast("🔔 ¡NUEVO PEDIDO RECIBIDO EN COCINA!", "success");
            }
            return data as Order[];
          }
          return currentOrders; // Si nada cambió, React no hace render
        });
      }
    };

    // Ejecutamos el rescate cada 3000 milisegundos (3 segundos)
    const pollingInterval = setInterval(syncDataBackground, 3000);

    // --- SISTEMA EN TIEMPO REAL (WEBSOCKETS) ---
    // Actúa como Plan A para reflejar cambios en milisegundos si la red lo permite
    supabase.removeAllChannels();
    const channel = supabase
      .channel('kitchen-monitor')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        syncDataBackground(); 
      })
      .subscribe();

    return () => {
      authListener.subscription.unsubscribe();
      clearInterval(pollingInterval);
      supabase.removeChannel(channel);
    };
  }, [router]);

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus as Order['status'] } : o));
    try {
      await updateOrderStatusAction(orderId, newStatus);
      showToast(`Pedido marcado como ${newStatus}`, 'success');
    } catch (error) {
      showToast("Error al actualizar el pedido", 'error');
    }
  };

  const confirmDeleteOrder = (orderId: string, customerName: string) => {
    setModalConfig({
      show: true,
      title: "Eliminar Pedido",
      message: `¿Estás seguro de eliminar el pedido de ${customerName}? Esta acción no se puede deshacer.`,
      confirmText: "Sí, eliminar",
      isDestructive: true,
      onConfirm: async () => {
        setOrders(prev => prev.filter(o => o.id !== orderId));
        try {
          await deleteOrderAction(orderId);
          showToast("Pedido eliminado correctamente", 'success');
        } catch (error) {
          showToast("Error al eliminar pedido", 'error');
        }
        setModalConfig(null);
      }
    });
  };

  const toggleSoldOut = async (productId: number, currentStatus: boolean, productName: string) => {
    setMenuProducts(prev => prev.map(p => p.id === productId ? { ...p, is_sold_out: !currentStatus } : p));
    try {
      const newStatus = await toggleSoldOutAction(productId, currentStatus);
      showToast(`${productName} ahora está ${newStatus ? 'AGOTADO' : 'DISPONIBLE'}`, newStatus ? 'error' : 'success');
    } catch (error) {
      showToast("Error al actualizar estado del producto", 'error');
    }
  };

  const uploadImageToStorage = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return await uploadImageAction(formData);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName) return showToast("Por favor ingresa un nombre para el producto.", "error");
    if (!editingId && !newImageFile && !hasVariants && !currentImageUrl) return showToast("Por favor selecciona una imagen para el producto.", "error");

    setIsSaving(true);
    try {
      let mainImageUrl = currentImageUrl;
      if (newImageFile) mainImageUrl = await uploadImageToStorage(newImageFile);

      let processedVariants = [];
      if (hasVariants) {
        for (const variant of variantsList) {
          let variantImageUrl = variant.image || '';
          if (variant.imageFile) {
            variantImageUrl = await uploadImageToStorage(variant.imageFile);
          }
          processedVariants.push({ name: variant.name, description: variant.description, price: variant.price, image: variantImageUrl });
        }
      }

      const productData = {
        name: newName,
        category: newCategory,
        image: mainImageUrl || (processedVariants[0]?.image || ''),
        description: hasVariants ? null : newDesc,
        price: hasVariants ? null : newPrice,
        variants: hasVariants ? processedVariants : null,
      };

      await saveProductAction(productData, editingId);
      showToast(editingId ? "¡Producto actualizado con éxito!" : "¡Producto creado con éxito!", "success");
      
      resetForm();
      const freshMenu = await fetchMenuOnly();
      setMenuProducts(freshMenu);
    } catch (error: any) {
      showToast(`Error al guardar: ${error.message}`, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const startEditing = (product: MenuProduct) => {
    setEditingId(product.id);
    setNewName(product.name);
    setNewCategory(product.category);
    setImageUrl(product.image);
    setFileInputKey(Date.now()); 
    
    if (product.variants && product.variants.length > 0) {
      setHasVariants(true);
      setVariantsList(product.variants.map(v => ({ ...v, imageFile: null })));
    } else {
      setHasVariants(false);
      setNewPrice(product.price || '$85 MXN');
      setNewDesc(product.description || '');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setEditingId(null);
    setNewName('');
    setNewCategory('comida');
    setHasVariants(false);
    setNewPrice('$85 MXN');
    setNewDesc('');
    setVariantsList([{ name: 'Relleno Clásico', description: '', price: '$85 MXN', image: '', imageFile: null }]);
    setNewImageFile(null);
    setImageUrl('');
    setFileInputKey(Date.now());
  };

  const confirmDeleteProduct = (productId: number, productName: string) => {
    setModalConfig({
      show: true,
      title: "Eliminar Producto",
      message: `¿Deseas eliminar permanentemente "${productName}" del menú?`,
      confirmText: "Sí, eliminar",
      isDestructive: true,
      onConfirm: async () => {
        try {
          await deleteProductAction(productId);
          showToast(`"${productName}" fue eliminado del menú`, "success");
          const freshMenu = await fetchMenuOnly();
          setMenuProducts(freshMenu);
        } catch (error) {
          showToast("Error al eliminar el producto", "error");
        }
        setModalConfig(null);
      }
    });
  };

  const toggleStoreOpen = async () => {
    try {
      const newStatus = await toggleStoreOpenAction(isOpen);
      setIsOpen(newStatus);
      showToast(`MOED ha sido ${newStatus ? 'ABIERTO' : 'CERRADO'} al público`, newStatus ? 'success' : 'error');
    } catch (error) {
      showToast("Error al cambiar estado de la tienda", "error");
    }
  };

  const confirmLogout = () => {
    setModalConfig({
      show: true,
      title: "Cerrar Sesión",
      message: "¿Estás seguro que deseas salir del panel de administración?",
      confirmText: "Cerrar Sesión",
      isDestructive: true,
      onConfirm: async () => {
        await supabase.auth.signOut();
        router.replace('/login');
      }
    });
  };

  const filteredInventory = menuProducts.filter(p => inventoryFilter === 'todos' ? true : p.category === inventoryFilter);

  if (!isAuthorized || loadingApp) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FDFBF7] font-sans text-gray-400">
        <Lock size={32} className="mb-4 animate-pulse text-gray-300" />
        <p className="text-sm font-bold tracking-widest uppercase">Verificando Credenciales Seguras...</p>
      </div>
    );
  }

  const pendingOrders = orders.filter(o => o.status === 'Pendiente');
  const prepOrders = orders.filter(o => o.status === 'Preparando');
  const readyOrders = orders.filter(o => o.status === 'Listo');

  return (
    <div className="min-h-screen bg-[#FDFBF7] font-sans text-[#1A1A1A] relative">
      <Head><title>MOED | Panel Admin</title></Head>

      {/* COMPONENTE TOAST FLOTANTE */}
      {toast && (
        <div className={`fixed bottom-8 right-8 z-[100] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] font-bold text-sm transition-all duration-300 transform translate-y-0 opacity-100 max-w-sm w-max ${
          toast.type === 'success' ? 'bg-[#1A1A1A] text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle size={20} className="text-emerald-400" /> : <AlertTriangle size={20} />}
          {toast.message}
        </div>
      )}

      {/* COMPONENTE MODAL */}
      {modalConfig && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm transition-opacity duration-300">
          <div className="bg-white rounded-[2rem] p-8 max-w-sm w-full mx-4 shadow-2xl text-center relative transform scale-100 transition-transform duration-300 border border-gray-100">
            <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-5 shadow-sm ${modalConfig.isDestructive ? 'bg-red-50 text-red-500' : 'bg-gray-50 text-[#1A1A1A]'}`}>
              {modalConfig.isDestructive ? <AlertTriangle size={28} /> : <CheckCircle size={28} />}
            </div>
            <h3 className="text-xl font-bold mb-2">{modalConfig.title}</h3>
            <p className="text-gray-500 text-sm mb-8 leading-relaxed">{modalConfig.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setModalConfig(null)} className="flex-1 py-3.5 bg-gray-50 rounded-xl font-bold text-sm text-gray-600 hover:bg-gray-100 transition-colors border border-gray-200">Cancelar</button>
              <button onClick={modalConfig.onConfirm} className={`flex-1 py-3.5 rounded-xl font-bold text-sm text-white transition-colors shadow-md ${modalConfig.isDestructive ? 'bg-red-600 hover:bg-red-700' : 'bg-[#1A1A1A] hover:bg-black'}`}>
                {modalConfig.confirmText || 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NAVEGACIÓN SUPERIOR */}
      <nav className="bg-white border-b border-gray-100 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#1A1A1A] rounded-xl flex items-center justify-center overflow-hidden shadow-sm">
               <Image src="/logo.jpg" alt="Logo" width={40} height={40} className="object-cover" />
            </div>
            <div>
              <h1 className="font-serif font-black text-xl leading-none">MOED <span className="text-gray-400 font-sans text-xs font-semibold tracking-wider">ADMIN</span></h1>
            </div>
          </div>

          <div className="bg-gray-50 p-1 rounded-xl flex gap-1 border border-gray-200 overflow-x-auto hide-scrollbar">
            <button onClick={() => setActiveTab('pedidos')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${activeTab === 'pedidos' ? 'bg-white shadow-sm text-black border border-gray-200' : 'text-gray-500 hover:text-black'}`}>📦 Cocina ({orders.length})</button>
            <button onClick={() => setActiveTab('menu')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${activeTab === 'menu' ? 'bg-white shadow-sm text-black border border-gray-200' : 'text-gray-500 hover:text-black'}`}>🥐 Menú</button>
            <button onClick={() => setActiveTab('config')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${activeTab === 'config' ? 'bg-white shadow-sm text-black border border-gray-200' : 'text-gray-500 hover:text-black'}`}>⚙️ Ajustes</button>
          </div>
          
          <button onClick={confirmLogout} className="text-xs font-bold text-gray-400 hover:text-red-600 p-2 sm:px-4 sm:py-2 rounded-xl flex items-center gap-2 transition-colors hover:bg-red-50">
            <LogOut size={18} /> <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        
        {/* VISTA 1: COCINA */}
        {activeTab === 'pedidos' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            {/* Columna Nuevos */}
            <section className="bg-gray-50/50 border border-gray-200 rounded-[2rem] p-5 min-h-[600px] shadow-inner">
              <div className="flex items-center gap-3 mb-6 px-1">
                <div className="p-2 bg-yellow-100 text-yellow-600 rounded-xl shadow-sm"><Clock size={20} /></div>
                <h2 className="font-bold text-lg text-gray-800">Nuevos Pedidos</h2>
                <span className="ml-auto bg-white border border-gray-200 text-xs font-black text-gray-600 px-2.5 py-1 rounded-lg shadow-sm">{pendingOrders.length}</span>
              </div>
              <div className="space-y-4">
                {pendingOrders.length === 0 && <div className="text-center text-gray-400 text-sm py-12 border-2 border-dashed border-gray-200 rounded-3xl flex flex-col items-center"><UtensilsCrossed size={32} className="mb-3 opacity-20"/>Sin pedidos nuevos</div>}
                {pendingOrders.map(order => (
                  <div key={order.id} className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm hover:shadow-md transition-shadow relative group">
                    <button onClick={() => confirmDeleteOrder(order.id, order.customer_name)} className="absolute top-5 right-5 text-gray-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors"><Trash2 size={16} /></button>
                    <div className="flex justify-between items-start mb-4 border-b border-gray-50 pb-4 pr-8">
                      <div>
                        <h3 className="font-bold text-lg text-gray-900 leading-tight">{order.customer_name}</h3>
                        <a href={`https://wa.me/52${order.customer_phone}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md mt-1.5 hover:bg-emerald-100 transition-colors">
                          <MessageCircle size={12} /> {order.customer_phone}
                        </a>
                      </div>
                      <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-md">{new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="space-y-3 mb-5">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <span className="font-black w-6 text-gray-800">{item.quantity}x</span>
                          <div className="flex-1 min-w-0 pr-2">
                            <p className="font-bold text-gray-800 truncate">{item.name}</p>
                            {item.variantName && <p className="text-xs text-gray-500 truncate">{item.variantName}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-4 border-t border-gray-50">
                      <div className="font-black text-xl text-gray-900">${order.total}</div>
                      <button onClick={() => updateOrderStatus(order.id, 'Preparando')} className="bg-blue-50 text-blue-600 font-bold px-4 py-2.5 rounded-xl text-xs hover:bg-blue-100 flex items-center gap-1.5 transition-colors"><ChefHat size={14} /> Cocinar</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Columna Preparando */}
            <section className="bg-gray-50/50 border border-gray-200 rounded-[2rem] p-5 min-h-[600px] shadow-inner">
              <div className="flex items-center gap-3 mb-6 px-1">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-xl shadow-sm"><ChefHat size={20} /></div>
                <h2 className="font-bold text-lg text-gray-800">En Preparación</h2>
                <span className="ml-auto bg-white border border-gray-200 text-xs font-black text-gray-600 px-2.5 py-1 rounded-lg shadow-sm">{prepOrders.length}</span>
              </div>
              <div className="space-y-4">
                {prepOrders.length === 0 && <div className="text-center text-gray-400 text-sm py-12 border-2 border-dashed border-gray-200 rounded-3xl flex flex-col items-center"><ChefHat size={32} className="mb-3 opacity-20"/>Nada en cocina</div>}
                {prepOrders.map(order => (
                  <div key={order.id} className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm hover:shadow-md transition-shadow relative group">
                    <button onClick={() => confirmDeleteOrder(order.id, order.customer_name)} className="absolute top-5 right-5 text-gray-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors"><Trash2 size={16} /></button>
                    <div className="flex justify-between items-start mb-4 border-b border-gray-50 pb-4 pr-8">
                      <div>
                        <h3 className="font-bold text-lg text-gray-900 leading-tight">{order.customer_name}</h3>
                        <a href={`https://wa.me/52${order.customer_phone}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md mt-1.5 hover:bg-emerald-100 transition-colors">
                          <MessageCircle size={12} /> {order.customer_phone}
                        </a>
                      </div>
                      <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-md">{new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="space-y-3 mb-5">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <span className="font-black w-6 text-gray-800">{item.quantity}x</span>
                          <div className="flex-1 min-w-0 pr-2">
                            <p className="font-bold text-gray-800 truncate">{item.name}</p>
                            {item.variantName && <p className="text-xs text-gray-500 truncate">{item.variantName}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-4 border-t border-gray-50">
                      <div className="font-black text-xl text-gray-900">${order.total}</div>
                      <button onClick={() => updateOrderStatus(order.id, 'Listo')} className="bg-emerald-50 text-emerald-600 font-bold px-4 py-2.5 rounded-xl text-xs hover:bg-emerald-100 flex items-center gap-1.5 transition-colors"><CheckCircle size={14} /> Listo</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Columna Listos */}
            <section className="bg-gray-50/50 border border-gray-200 rounded-[2rem] p-5 min-h-[600px] shadow-inner">
              <div className="flex items-center gap-3 mb-6 px-1">
                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl shadow-sm"><CheckCircle size={20} /></div>
                <h2 className="font-bold text-lg text-gray-800">Listos</h2>
                <span className="ml-auto bg-white border border-gray-200 text-xs font-black text-gray-600 px-2.5 py-1 rounded-lg shadow-sm">{readyOrders.length}</span>
              </div>
              <div className="space-y-4">
                {readyOrders.length === 0 && <div className="text-center text-gray-400 text-sm py-12 border-2 border-dashed border-gray-200 rounded-3xl flex flex-col items-center"><CheckCircle size={32} className="mb-3 opacity-20"/>No hay pedidos listos</div>}
                {readyOrders.map(order => (
                  <div key={order.id} className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm hover:shadow-md transition-shadow relative group">
                    <button onClick={() => confirmDeleteOrder(order.id, order.customer_name)} className="absolute top-5 right-5 text-gray-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors"><Trash2 size={16} /></button>
                    <div className="flex justify-between items-start mb-4 border-b border-gray-50 pb-4 pr-8">
                      <div>
                        <h3 className="font-bold text-lg text-gray-900 leading-tight">{order.customer_name}</h3>
                        <a href={`https://wa.me/52${order.customer_phone}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md mt-1.5 hover:bg-emerald-100 transition-colors">
                          <MessageCircle size={12} /> {order.customer_phone}
                        </a>
                      </div>
                      <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-md">{new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="space-y-3 mb-5">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <span className="font-black w-6 text-gray-800">{item.quantity}x</span>
                          <div className="flex-1 min-w-0 pr-2">
                            <p className="font-bold text-gray-800 truncate">{item.name}</p>
                            {item.variantName && <p className="text-xs text-gray-500 truncate">{item.variantName}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-4 border-t border-gray-50">
                      <div className="font-black text-xl text-gray-900">${order.total}</div>
                      <button onClick={() => updateOrderStatus(order.id, 'Completado')} className="bg-[#1A1A1A] text-white font-bold px-4 py-2.5 rounded-xl text-xs hover:bg-black transition-colors shadow-md">Entregar</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* VISTA 2: GESTIONAR Y CREAR MENÚ */}
        {activeTab === 'menu' && (
          <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
            {/* Formulario Rediseñado */}
            <div className="bg-white border border-gray-200 rounded-[2rem] p-6 sm:p-8 shadow-sm">
              <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-100">
                <h2 className="text-xl font-black flex items-center gap-2 text-gray-800">
                  <LayoutGrid size={24} className="text-gray-400"/> 
                  {editingId ? 'Editar Producto' : 'Agregar Nuevo Producto'}
                </h2>
                {editingId && (
                  <button type="button" onClick={resetForm} className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-gray-200 transition-colors"><X size={14}/> Cancelar Edición</button>
                )}
              </div>

              <form onSubmit={handleSaveProduct} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider">Nombre del Producto</label>
                    <input required type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ej. Croissant" className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] focus:border-transparent transition-all shadow-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider">Categoría</label>
                    <select value={newCategory} onChange={e => setNewCategory(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] focus:border-transparent transition-all shadow-sm cursor-pointer">
                      <option value="comida">Comida</option>
                      <option value="bebidas">Bebidas</option>
                    </select>
                  </div>
                  
                  {!hasVariants && (
                    <div className="md:col-span-2 space-y-1.5">
                      <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider">Imagen Principal</label>
                      <div className="relative">
                        <input key={`main-img-${fileInputKey}`} type="file" accept="image/*" onChange={e => setNewImageFile(e.target.files?.[0] || null)} className="w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-5 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#1A1A1A] file:text-white hover:file:bg-black file:cursor-pointer file:transition-colors border border-gray-200 bg-gray-50 rounded-xl cursor-pointer" />
                      </div>
                    </div>
                  )}

                  <div className="md:col-span-2 mt-2">
                    <label className="flex items-center gap-3 cursor-pointer select-none bg-gray-50 p-4 rounded-2xl border border-gray-200 hover:bg-gray-100 transition-colors">
                      <input type="checkbox" checked={hasVariants} onChange={e => setHasVariants(e.target.checked)} className="w-5 h-5 rounded text-[#1A1A1A] accent-[#1A1A1A] focus:ring-[#1A1A1A]" />
                      <span className="text-sm font-bold text-gray-800">Este producto tiene múltiples variantes (sabores, rellenos, tamaños)</span>
                    </label>
                  </div>
                </div>

                {/* Campos Simples vs Variantes */}
                {!hasVariants ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 border-t border-gray-100">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider">Precio</label>
                      <input required type="text" value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder="$85 MXN" className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] transition-all shadow-sm" />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1.5"><FileText size={14}/> Descripción (Visible para el cliente)</label>
                      <textarea rows={3} value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Ej. Delicioso croissant horneado al momento..." className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] transition-all shadow-sm resize-none" />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5 pt-4 border-t border-gray-100">
                    <div className="flex justify-between items-center bg-gray-100 px-5 py-3 rounded-2xl border border-gray-200">
                      <h4 className="font-black text-sm text-gray-700">Variantes del Producto</h4>
                      <button type="button" onClick={() => setVariantsList(prev => [...prev, { name: '', description: '', price: '$85 MXN', image: '', imageFile: null }])} className="text-xs bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-xl font-bold hover:bg-gray-50 transition-colors shadow-sm flex items-center gap-1.5">
                        <PlusCircle size={14}/> Variante
                      </button>
                    </div>
                    
                    <div className="space-y-4">
                      {variantsList.map((variant, idx) => (
                        <div key={`variant-${idx}`} className="bg-gray-50/50 p-5 rounded-[1.5rem] border border-gray-200 space-y-4 relative group hover:border-gray-300 transition-colors">
                          <div className="flex flex-col md:flex-row gap-4">
                            <div className="flex-1 space-y-1.5">
                              <label className="block text-[10px] font-bold text-gray-500 uppercase">Nombre</label>
                              <input placeholder="Ej. Relleno Especial" value={variant.name} onChange={e => { const val = e.target.value; setVariantsList(prev => prev.map((v, i) => i === idx ? { ...v, name: val } : v)); }} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] shadow-sm" />
                            </div>
                            <div className="w-full md:w-32 space-y-1.5">
                              <label className="block text-[10px] font-bold text-gray-500 uppercase">Precio</label>
                              <input placeholder="$85 MXN" value={variant.price} onChange={e => { const val = e.target.value; setVariantsList(prev => prev.map((v, i) => i === idx ? { ...v, price: val } : v)); }} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] shadow-sm" />
                            </div>
                          </div>
                          
                          <div className="space-y-1.5">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase">Descripción detallada</label>
                            <textarea rows={2} placeholder="Descripción específica de esta variante..." value={variant.description} onChange={e => { const val = e.target.value; setVariantsList(prev => prev.map((v, i) => i === idx ? { ...v, description: val } : v)); }} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] shadow-sm resize-none" />
                          </div>
                          
                          <div className="flex items-center gap-4 bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
                            {variant.image && (
                              <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-gray-100 shadow-sm shrink-0">
                                <Image src={variant.image} alt="Prev" fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" />
                              </div>
                            )}
                            <div className="flex-1">
                              <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase tracking-wider">Foto Individual (Opcional)</label>
                              <input key={`var-img-${fileInputKey}-${idx}`} type="file" accept="image/*" onChange={e => { const file = e.target.files?.[0] || null; setVariantsList(prev => prev.map((v, i) => i === idx ? { ...v, imageFile: file } : v)); }} className="w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 transition-colors cursor-pointer" />
                            </div>
                          </div>

                          {variantsList.length > 1 && (
                            <button type="button" onClick={() => setVariantsList(prev => prev.filter((_, i) => i !== idx))} className="absolute -top-3 -right-3 bg-red-100 text-red-600 p-2 rounded-full shadow-sm hover:bg-red-600 hover:text-white transition-colors" title="Eliminar Variante"><Trash2 size={14}/></button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button type="submit" disabled={isSaving} className="w-full bg-[#1A1A1A] text-white py-4 rounded-2xl font-black text-sm tracking-wide hover:bg-black disabled:bg-gray-400 mt-8 transition-colors shadow-lg shadow-black/10 flex items-center justify-center gap-2">
                  {isSaving ? <span className="animate-pulse">Guardando Producto...</span> : (editingId ? <><Edit3 size={18}/> Actualizar Producto</> : <><CheckCircle size={18}/> Guardar y Publicar</>)}
                </button>
              </form>
            </div>

            {/* Listado con Filtros - Ahora renderiza la descripción */}
            <div className="bg-white border border-gray-200 rounded-[2rem] p-6 sm:p-8 shadow-sm">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-5 mb-8 border-b border-gray-100 pb-5">
                <h2 className="text-xl font-black flex items-center gap-2 text-gray-800"><UtensilsCrossed size={24} className="text-gray-400"/> Inventario</h2>
                <div className="bg-gray-50 p-1.5 rounded-xl flex gap-1 border border-gray-200 text-xs font-bold w-full md:w-auto">
                  <button onClick={() => setInventoryFilter('todos')} className={`flex-1 md:flex-none px-4 py-2 rounded-lg transition-all ${inventoryFilter === 'todos' ? 'bg-white shadow-sm text-black border border-gray-200' : 'text-gray-500 hover:text-black'}`}>Todos</button>
                  <button onClick={() => setInventoryFilter('comida')} className={`flex-1 md:flex-none px-4 py-2 rounded-lg transition-all ${inventoryFilter === 'comida' ? 'bg-white shadow-sm text-black border border-gray-200' : 'text-gray-500 hover:text-black'}`}>🥐 Comida</button>
                  <button onClick={() => setInventoryFilter('bebidas')} className={`flex-1 md:flex-none px-4 py-2 rounded-lg transition-all ${inventoryFilter === 'bebidas' ? 'bg-white shadow-sm text-black border border-gray-200' : 'text-gray-500 hover:text-black'}`}>🧋 Bebidas</button>
                </div>
              </div>

              <div className="divide-y divide-gray-100">
                {filteredInventory.length === 0 && <p className="text-center text-gray-400 text-sm py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">No hay productos en esta categoría.</p>}
                
                {filteredInventory.map(product => (
                  <div key={product.id} className="py-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 group">
                    <div className="flex items-start gap-5 flex-1 min-w-0">
                      <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-gray-100 shrink-0 border border-gray-200 shadow-sm">
                        {product.image ? (
                           <Image src={product.image} alt={product.name} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover group-hover:scale-105 transition-transform duration-500" />
                        ) : (
                           <div className="w-full h-full flex items-center justify-center text-gray-400"><ImageIcon size={24} opacity={0.5}/></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 pr-4">
                        <h4 className="font-black text-lg text-gray-900 mb-1">{product.name}</h4>
                        
                        {/* AQUI ESTÁ LA SOLUCIÓN DE LA DESCRIPCIÓN */}
                        {product.description && (
                          <p className="text-sm text-gray-500 line-clamp-2 leading-relaxed mb-2">{product.description}</p>
                        )}
                        
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className="text-[10px] sm:text-xs font-bold px-2.5 py-1 bg-gray-100 rounded-md text-gray-600 uppercase tracking-wider border border-gray-200">
                            {product.category}
                          </span>
                          <span className="text-[10px] sm:text-xs font-bold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md border border-blue-100">
                            {product.variants ? `${product.variants.length} Opciones` : product.price}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 w-full md:w-auto justify-end shrink-0 pt-2 md:pt-0">
                      <button onClick={() => toggleSoldOut(product.id, product.is_sold_out, product.name)} className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-sm ${product.is_sold_out ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'}`}>
                        {product.is_sold_out ? <><AlertTriangle size={14} /> Agotado</> : <><CheckCircle size={14} /> Activo</>}
                      </button>
                      <button onClick={() => startEditing(product)} className="p-2.5 bg-white border border-gray-200 text-gray-600 hover:text-black hover:border-gray-400 rounded-xl transition-all shadow-sm" title="Editar producto"><Edit3 size={18}/></button>
                      <button onClick={() => confirmDeleteProduct(product.id, product.name)} className="p-2.5 bg-white border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 rounded-xl transition-all shadow-sm" title="Eliminar producto"><Trash2 size={18}/></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* VISTA 3: CONFIGURACIÓN */}
        {activeTab === 'config' && (
          <div className="max-w-xl mx-auto animate-fade-in">
            <div className="bg-white border border-gray-200 rounded-[2rem] p-10 shadow-sm text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-gray-200 via-gray-400 to-gray-200 opacity-20"></div>
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border-4 border-white transition-colors ${isOpen ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                <Store size={36} />
              </div>
              <h2 className="text-3xl font-black mb-3 text-gray-900">Tienda {isOpen ? 'Abierta' : 'Cerrada'}</h2>
              <p className="text-gray-500 text-sm mb-10 leading-relaxed max-w-sm mx-auto">
                Controla la visibilidad del menú para tus clientes. Cuando cierres la tienda, el menú será ocultado por una pantalla de aviso.
              </p>
              <button onClick={toggleStoreOpen} className={`w-full py-5 rounded-2xl font-black text-lg transition-all shadow-lg flex items-center justify-center gap-3 border ${isOpen ? 'bg-white text-red-600 border-red-200 hover:bg-red-50' : 'bg-[#1A1A1A] text-white border-transparent hover:bg-black'}`}>
                <Power size={22} />
                {isOpen ? 'Apagar Tienda (Cerrar)' : 'Encender Tienda (Abrir)'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}