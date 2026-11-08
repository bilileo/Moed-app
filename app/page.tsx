"use client";
import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { ChevronLeft, ChevronRight, ShoppingCart, X, Plus, Minus, Trash2, Store, Clock } from 'lucide-react';
import Image from 'next/image';
import { supabase } from './lib/supabase';

// IMPORTACIÓN DEL CONTROLADOR
import { getClientMenuData, submitOrderAction } from './controllers/clientController';

interface MenuVariant {
  name: string;
  description: string;
  price: string;
  image?: string; 
}

interface MenuItem {
  id: number;
  name: string;
  category: string;
  image: string;
  description?: string;
  price?: string;
  variants?: MenuVariant[];
  is_sold_out: boolean;
}

interface CartItem {
  cartId: string;
  id: number;
  name: string;
  variantName: string | null;
  price: number;
  quantity: number;
  image: string;
}

export default function MenuApp() {
  const [menuCategory, setMenuCategory] = useState<'comida' | 'bebidas'>('comida');
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isOpen, setIsOpen] = useState(true);
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [botHoneypot, setBotHoneypot] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const fetchInitialData = async () => {
    try {
      const data = await getClientMenuData();
      setMenuItems(data.menuItems as MenuItem[]);
      setIsOpen(data.isOpen);
    } catch (error) {
      console.error("Error cargando menú", error);
    }
  };

  useEffect(() => {
    fetchInitialData();

    const channel = supabase
      .channel('client-store-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, () => {
        fetchInitialData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_config' }, (payload: any) => {
        const updated = payload.new;
        if (updated && updated.key === 'is_open') {
          // Convertimos el texto a booleano para que React lo entienda
          setIsOpen(updated.value === true || updated.value === 'true');
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const activeMenu = menuItems.filter(item => item.category?.toLowerCase() === menuCategory.toLowerCase());

  const handleAddToCart = (item: MenuItem, variantIdx: number) => {
    if (item.is_sold_out || !isOpen) return;

    const hasVariants = item.variants && item.variants.length > 0;
    const variantName = hasVariants ? item.variants![variantIdx].name : null;
    const priceStr = hasVariants ? item.variants![variantIdx].price : item.price;
    const numericPrice = parseFloat((priceStr || '0').replace(/[^0-9.-]+/g, ""));
    const image = hasVariants && item.variants![variantIdx].image ? item.variants![variantIdx].image : item.image;
    const cartId = `${item.id}-${variantName || 'default'}`;

    setCart(prev => {
      const existing = prev.find(i => i.cartId === cartId);
      if (existing) {
        const newQty = Math.min(100, existing.quantity + 1);
        return prev.map(i => i.cartId === cartId ? { ...i, quantity: newQty } : i);
      }
      return [...prev, { cartId, id: item.id, name: item.name, variantName, price: numericPrice, quantity: 1, image: image! }];
    });
    
    setIsMobileCartOpen(true);
  };

  const updateQuantity = (cartId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.cartId === cartId) {
        const newQty = Math.max(1, Math.min(100, item.quantity + delta));
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const removeFromCart = (cartId: string) => setCart(prev => prev.filter(item => item.cartId !== cartId));

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '');
    if (val.length <= 10) setCustomerPhone(val);
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!isOpen) {
      setErrorMessage("Lo sentimos, MOED se encuentra cerrado en este momento.");
      return;
    }
    if (cart.length === 0 || cartTotal === 0) return;
    if (customerPhone.length !== 10) {
      setErrorMessage("El número de WhatsApp debe tener exactamente 10 dígitos.");
      return;
    }
    if (botHoneypot !== "") {
      setOrderSuccess(true);
      return;
    }

    setIsSubmitting(true);
    try {
      const orderData = {
        customer_name: customerName,
        customer_phone: customerPhone,
        items: cart,
        total: cartTotal,
        status: 'Pendiente'
      };

      await submitOrderAction(orderData);

      setOrderSuccess(true);
      setCart([]);
      setTimeout(() => {
        setOrderSuccess(false);
        setIsMobileCartOpen(false);
        setCustomerName("");
        setCustomerPhone("");
      }, 4000);
    } catch (error) {
      setErrorMessage("Ocurrió un error al enviar tu pedido. Intenta de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const MenuCard = ({ item }: { item: MenuItem }) => {
    const [activeIdx, setActiveIdx] = useState(0);
    const hasVariants = item.variants && item.variants.length > 0;
    
    const currentPriceStr = hasVariants ? item.variants![activeIdx]?.price : item.price;
    const currentDesc = hasVariants ? item.variants![activeIdx]?.description : item.description;
    const currentVariantName = hasVariants ? item.variants![activeIdx]?.name : null;
    const currentImage = hasVariants && item.variants![activeIdx]?.image ? item.variants![activeIdx].image : item.image;

    return (
      <div className={`w-[75vw] max-w-[280px] md:max-w-[300px] snap-start shrink-0 group flex flex-col bg-white p-4 rounded-3xl shadow-sm border border-gray-100 mx-auto relative ${item.is_sold_out || !isOpen ? 'opacity-75' : ''}`}>
        {item.is_sold_out && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-10 rounded-3xl flex items-center justify-center">
            <span className="bg-red-600 text-white font-black px-4 py-2 rounded-full uppercase tracking-wider text-sm shadow-lg rotate-[-10deg]">Agotado</span>
          </div>
        )}
        <div className="aspect-[4/5] bg-[#FDFBF7] rounded-2xl mb-4 overflow-hidden relative shadow-inner">
          {currentImage ? (
            <Image src={currentImage} alt={item.name} fill className="object-cover group-hover:scale-105 transition-transform duration-500" sizes="(max-width: 768px) 280px, 300px" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">Sin imagen</div>
          )}
        </div>
        <h3 className="text-lg md:text-xl font-bold mb-2 text-center md:text-left">{item.name}</h3>
        {hasVariants && (
          <div className="flex items-center justify-between bg-gray-100/80 rounded-full px-2 py-1 mb-3">
            <button onClick={(e) => { e.preventDefault(); setActiveIdx(p => (p === 0 ? item.variants!.length - 1 : p - 1)); }} className="p-1 hover:bg-white rounded-full"><ChevronLeft size={16} /></button>
            <span className="text-sm font-semibold text-gray-800 flex-1 text-center truncate px-2">{currentVariantName}</span>
            <button onClick={(e) => { e.preventDefault(); setActiveIdx(p => (p + 1) % item.variants!.length); }} className="p-1 hover:bg-white rounded-full"><ChevronRight size={16} /></button>
          </div>
        )}
        <p className="text-gray-600 text-sm leading-relaxed min-h-[70px] flex-grow text-center md:text-left">{currentDesc}</p>
        {hasVariants && item.variants!.length > 1 && (
          <div className="flex justify-center gap-1.5 mt-2 mb-4">
            {item.variants!.map((_, idx) => (
              <div key={idx} className={`w-1.5 h-1.5 rounded-full ${idx === activeIdx ? 'bg-black' : 'bg-gray-300'}`} />
            ))}
          </div>
        )}
        <button 
          onClick={() => handleAddToCart(item, activeIdx)}
          disabled={item.is_sold_out || !isOpen}
          className={`w-full mt-auto py-3 rounded-full font-medium transition-transform shadow-md flex justify-between items-center px-6 ${
            item.is_sold_out || !isOpen ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none' : 'bg-[#1A1A1A] text-white hover:bg-black hover:scale-[1.02]'
          }`}
        >
          <span>{!isOpen ? 'Cerrado' : item.is_sold_out ? 'No disponible' : 'Agregar'}</span>
          <span className="font-bold">{currentPriceStr}</span>
        </button>
      </div>
    );
  };

  const renderCartContent = () => (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center justify-between p-6 border-b border-gray-100">
        <h2 className="text-xl font-bold flex items-center gap-2"><ShoppingCart size={24}/> Tu Pedido</h2>
        <button onClick={() => setIsMobileCartOpen(false)} className="lg:hidden p-2 hover:bg-gray-100 rounded-full"><X size={20}/></button>
      </div>
      {orderSuccess ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6">✓</div>
          <h3 className="text-2xl font-bold mb-2">¡Pedido Recibido!</h3>
          <p className="text-gray-500">Te avisaremos al {customerPhone} cuando esté listo.</p>
        </div>
      ) : cart.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-500">
          <ShoppingCart size={48} className="mb-4 opacity-20" />
          <p>Tu carrito está vacío</p>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {cart.map(item => (
              <div key={item.cartId} className="flex gap-4 items-center">
                <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                  {item.image && <Image src={item.image} alt={item.name} fill className="object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-sm truncate">{item.name}</h4>
                  {item.variantName && <p className="text-xs text-gray-500">{item.variantName}</p>}
                  <div className="font-bold text-sm mt-1">${item.price}</div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <button onClick={() => removeFromCart(item.cartId)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={16}/></button>
                  <div className="flex items-center gap-3 bg-gray-100 rounded-full px-2 py-1">
                    <button onClick={() => updateQuantity(item.cartId, -1)} className="p-1 hover:bg-white rounded-full"><Minus size={12}/></button>
                    <span className="text-xs font-bold w-6 text-center">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.cartId, 1)} className="p-1 hover:bg-white rounded-full"><Plus size={12}/></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t p-6 bg-gray-50">
            <div className="flex justify-between items-center mb-6">
              <span className="text-gray-600">Total a pagar</span>
              <span className="text-2xl font-black">${cartTotal} MXN</span>
            </div>
            {errorMessage && <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-xl">{errorMessage}</div>}
            <form onSubmit={handleCheckout} className="space-y-3">
              <input type="text" value={botHoneypot} onChange={e => setBotHoneypot(e.target.value)} style={{ display: 'none' }} />
              <input required type="text" placeholder="Tu Nombre" value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-300 outline-none text-sm bg-white"/>
              <input required type="tel" placeholder="WhatsApp (10 dígitos)" value={customerPhone} onChange={handlePhoneChange} maxLength={10} className="w-full px-4 py-3 rounded-xl border border-gray-300 outline-none text-sm bg-white"/>
              <button type="submit" disabled={isSubmitting || !isOpen} className="w-full bg-[#1A1A1A] text-white py-4 rounded-xl font-bold hover:bg-black disabled:bg-gray-400">
                {isSubmitting ? 'Enviando...' : (!isOpen ? 'Negocio Cerrado' : 'Confirmar Pedido')}
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#1A1A1A] font-sans flex flex-col">
      <Head><title>MOED | Menú</title></Head>
      
      <nav className="sticky top-0 z-40 bg-[#FDFBF7]/95 backdrop-blur-md border-b border-gray-200">
        <div className="flex justify-between items-center py-4 px-6 max-w-5xl mx-auto w-full">
          <div className="text-2xl font-serif font-black tracking-tighter flex items-center gap-2">
            MOED<span className="text-xs font-sans font-light uppercase text-gray-500">Menú</span>
          </div>
          {isOpen && (
            <button onClick={() => setIsMobileCartOpen(true)} className="lg:hidden relative p-2.5 bg-white border border-gray-200 rounded-full shadow-sm">
              <ShoppingCart size={20} />
              {cartItemCount > 0 && <span className="absolute -top-1.5 -right-1.5 bg-[#1A1A1A] text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full">{cartItemCount}</span>}
            </button>
          )}
        </div>
      </nav>

      {/* RENDERIZADO CONDICIONAL: PANTALLA DE CIERRE O MENÚ COMPLETO */}
      {!isOpen ? (
        <main className="flex-1 flex flex-col items-center justify-center p-8 text-center my-auto animate-fade-in">
          <div className="w-24 h-24 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-6 shadow-inner">
            <Store size={48} />
          </div>
          <h1 className="text-3xl md:text-4xl font-serif font-black mb-3">MOED está Cerrado</h1>
          <p className="text-gray-500 max-w-md mx-auto text-base leading-relaxed">
            En este momento no estamos aceptando pedidos en línea. Vuelve a consultar más tarde para disfrutar de nuestros deliciosos snacks.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-full text-xs font-bold text-gray-600">
            <Clock size={14} /> Fuera de servicio temporalmente
          </div>
        </main>
      ) : (
        <div className="flex-1 flex w-full">
          <div className="flex-1 lg:pr-[380px] w-full">
            <main className="max-w-5xl mx-auto pt-8 pb-24">
              <div className="flex justify-center mb-8 px-6">
                <div className="bg-gray-100 p-1.5 rounded-full flex gap-1 border border-gray-200 w-full max-w-[300px]">
                  <button onClick={() => setMenuCategory('comida')} className={`flex-1 py-2.5 rounded-full text-sm font-bold ${menuCategory === 'comida' ? 'bg-white shadow text-black' : 'text-gray-500'}`}>🥐 Comida</button>
                  <button onClick={() => setMenuCategory('bebidas')} className={`flex-1 py-2.5 rounded-full text-sm font-bold ${menuCategory === 'bebidas' ? 'bg-white shadow text-black' : 'text-gray-500'}`}>🧋 Bebidas</button>
                </div>
              </div>
              <div className="flex flex-wrap justify-center md:grid md:grid-cols-2 xl:grid-cols-3 gap-6 px-6 pb-8">
                {activeMenu.map((item) => (
                  <MenuCard key={`menu-${item.id}`} item={item} />
                ))}
              </div>
            </main>
          </div>
          
          <aside className="hidden lg:block w-[380px] fixed right-0 top-0 bottom-0 bg-white border-l border-gray-200 z-50 shadow-2xl">
            {renderCartContent()}
          </aside>
          
          {isMobileCartOpen && (
            <div className="fixed inset-0 z-50 flex justify-end lg:hidden">
              <div className="absolute inset-0 bg-black/40" onClick={() => setIsMobileCartOpen(false)} />
              <div className="relative w-full max-w-md bg-white h-full shadow-2xl">{renderCartContent()}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}