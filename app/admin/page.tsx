"use client";
import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase'; 
import { Clock, ChefHat, CheckCircle, LogOut, MessageCircle, Lock, Trash2 } from 'lucide-react';
import Image from 'next/image';

// --- INTERFACES ---
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

export default function AdminDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingApp, setLoadingApp] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const verifySecurity = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        router.replace('/login');
        return;
      }
      
      setIsAuthorized(true);
      fetchOrders();
    };

    verifySecurity();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        setIsAuthorized(false);
        router.replace('/login');
      }
    });

    const channel = supabase
      .channel('realtime-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setOrders(prev => [payload.new as Order, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          setOrders(prev => prev.map(o => o.id === payload.new.id ? payload.new as Order : o));
        } else if (payload.eventType === 'DELETE') {
          setOrders(prev => prev.filter(o => o.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => {
      authListener.subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [router]);

  const fetchOrders = async () => {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .neq('status', 'Completado')
      .order('created_at', { ascending: false });
    
    if (data) setOrders(data as Order[]);
    setLoadingApp(false);
  };

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus as Order['status'] } : o));
    await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
  };

  // --- FUNCIÓN PARA ELIMINAR PEDIDO ---
  const deleteOrder = async (orderId: string, customerName: string) => {
    if (window.confirm(`¿Estás seguro de eliminar el pedido de ${customerName}?`)) {
      // Actualización optimista de la UI
      setOrders(prev => prev.filter(o => o.id !== orderId));
      
      // Borrar en Supabase
      const { error } = await supabase.from('orders').delete().eq('id', orderId);
      if (error) {
        console.error("Error al eliminar:", error);
        fetchOrders(); // Recargar si hubo un fallo
      }
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  // --- COMPONENTE DE TARJETA DE PEDIDO ---
  const OrderCard = ({ order }: { order: Order }) => {
    const timeAgo = new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow animate-fade-in-up relative group">
        
        {/* BOTÓN ELIMINAR (Esquina Superior Derecha) */}
        <button 
          onClick={() => deleteOrder(order.id, order.customer_name)}
          className="absolute top-4 right-4 text-gray-300 hover:text-red-500 transition-colors p-1"
          title="Eliminar pedido"
        >
          <Trash2 size={18} />
        </button>

        <div className="flex justify-between items-start mb-4 border-b border-gray-100 pb-3 pr-8">
          <div>
            <h3 className="font-bold text-lg">{order.customer_name}</h3>
            <a 
              href={`https://wa.me/52${order.customer_phone.replace(/\D/g, '')}?text=Hola%20${order.customer_name},%20somos%20MOED.`}
              target="_blank" 
              rel="noreferrer"
              className="text-sm text-gray-500 flex items-center gap-1 hover:text-[#25D366] transition-colors"
            >
              <MessageCircle size={14} /> {order.customer_phone}
            </a>
          </div>
          <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded-md">{timeAgo}</span>
        </div>

        <div className="space-y-3 mb-5 min-h-[100px]">
          {order.items.map((item, idx) => (
            <div key={idx} className="flex justify-between text-sm">
              <div className="flex gap-2">
                <span className="font-black w-5">{item.quantity}x</span>
                <div>
                  <p className="font-bold text-gray-800">{item.name}</p>
                  {item.variantName && <p className="text-xs text-gray-500">{item.variantName}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
          <div className="font-black text-lg">${order.total}</div>
          <div className="flex gap-2">
            {order.status === 'Pendiente' && (
              <button onClick={() => updateOrderStatus(order.id, 'Preparando')} className="bg-blue-50 text-blue-600 font-bold px-4 py-2 rounded-xl text-sm hover:bg-blue-100 transition-colors flex items-center gap-1">
                <ChefHat size={16} /> Cocinar
              </button>
            )}
            {order.status === 'Preparando' && (
              <button onClick={() => updateOrderStatus(order.id, 'Listo')} className="bg-green-50 text-green-600 font-bold px-4 py-2 rounded-xl text-sm hover:bg-green-100 transition-colors flex items-center gap-1">
                <CheckCircle size={16} /> Listo
              </button>
            )}
            {order.status === 'Listo' && (
              <button onClick={() => updateOrderStatus(order.id, 'Completado')} className="bg-[#1A1A1A] text-white font-bold px-4 py-2 rounded-xl text-sm hover:bg-black transition-colors">
                Entregar
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

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
    <div className="min-h-screen bg-[#FDFBF7] font-sans text-[#1A1A1A]">
      <Head><title>MOED | Admin Dashboard</title></Head>

      <nav className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center overflow-hidden border-2 border-black">
               <Image src="/logo.jpg" alt="Logo" width={40} height={40} className="object-cover" />
            </div>
            <div>
              <h1 className="font-serif font-black text-xl leading-none">MOED <span className="text-gray-400 font-sans text-sm font-normal">Cocina</span></h1>
            </div>
          </div>
          
          <button onClick={handleLogout} className="text-sm font-bold text-red-500 hover:bg-red-50 px-4 py-2 rounded-full transition-colors flex items-center gap-2">
            <LogOut size={16} /> <span className="hidden sm:inline">Cerrar Sesión</span>
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          
          <section className="bg-gray-50/50 border border-gray-200 rounded-3xl p-4 min-h-[600px]">
            <div className="flex items-center gap-2 mb-6 px-2">
              <div className="p-1.5 bg-yellow-100 text-yellow-600 rounded-lg"><Clock size={20} /></div>
              <h2 className="font-bold text-lg">Nuevos Pedidos</h2>
              <span className="ml-auto bg-gray-200 text-sm font-bold w-6 h-6 flex items-center justify-center rounded-full">{pendingOrders.length}</span>
            </div>
            <div className="space-y-4">
              {pendingOrders.length === 0 && <p className="text-center text-gray-400 text-sm py-10 border-2 border-dashed border-gray-200 rounded-2xl">No hay pedidos nuevos</p>}
              {pendingOrders.map(order => <OrderCard key={order.id} order={order} />)}
            </div>
          </section>

          <section className="bg-gray-50/50 border border-gray-200 rounded-3xl p-4 min-h-[600px]">
            <div className="flex items-center gap-2 mb-6 px-2">
              <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg"><ChefHat size={20} /></div>
              <h2 className="font-bold text-lg">En Preparación</h2>
              <span className="ml-auto bg-gray-200 text-sm font-bold w-6 h-6 flex items-center justify-center rounded-full">{prepOrders.length}</span>
            </div>
            <div className="space-y-4">
              {prepOrders.length === 0 && <p className="text-center text-gray-400 text-sm py-10 border-2 border-dashed border-gray-200 rounded-2xl">Nada en cocina</p>}
              {prepOrders.map(order => <OrderCard key={order.id} order={order} />)}
            </div>
          </section>

          <section className="bg-gray-50/50 border border-gray-200 rounded-3xl p-4 min-h-[600px]">
            <div className="flex items-center gap-2 mb-6 px-2">
              <div className="p-1.5 bg-green-100 text-green-600 rounded-lg"><CheckCircle size={20} /></div>
              <h2 className="font-bold text-lg">Listos</h2>
              <span className="ml-auto bg-gray-200 text-sm font-bold w-6 h-6 flex items-center justify-center rounded-full">{readyOrders.length}</span>
            </div>
            <div className="space-y-4">
              {readyOrders.length === 0 && <p className="text-center text-gray-400 text-sm py-10 border-2 border-dashed border-gray-200 rounded-2xl">No hay pedidos listos</p>}
              {readyOrders.map(order => <OrderCard key={order.id} order={order} />)}
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}