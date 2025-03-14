document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM cargado, inicializando...');
  checkAuth();
  const helloElement = document.getElementById('hello');
  if (helloElement) {
    helloElement.onclick = () => {
      window.location.href = 'register.html';
    };
    console.log('Evento onclick asignado a #hello');
  } else {
    console.error('Elemento #hello no encontrado');
  }
  const cartBtn = document.getElementById('cartBtn');
  if (cartBtn) {
    cartBtn.onclick = toggleCart;
    console.log('Evento onclick asignado a #cartBtn');
  } else {
    console.error('Elemento #cartBtn no encontrado');
  }
  if (window.location.pathname.includes('index.html') && !currentUser) {
    window.location.href = 'register.html';
  } else if (window.location.pathname.includes('index.html')) {
    loadOffers();
  }
});

async function checkAuth() {
  console.log('Verificando autenticación...');
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error('Error al verificar autenticación:', error.message);
  } else {
    currentUser = data?.user || null;
    console.log('Usuario actual:', currentUser);
    if (currentUser) setupRealtimeSubscriptions();
  }
  updateUI();
}

function setupRealtimeSubscriptions() {
  supabase
    .channel('messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room=eq.${currentChatRoom}` }, payload => {
      if (currentChatRoom && payload.new.room === currentChatRoom) {
        const messages = document.getElementById('messages');
        messages.innerHTML += `<p>${payload.new.message}</p>`;
        messages.scrollTop = messages.scrollHeight;
      }
    })
    .subscribe();

  supabase
    .channel('notifications')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${currentUser.id}` }, payload => {
      alert(`Notificación: ${payload.new.message}`);
    })
    .subscribe();
}

async function updateUI() {
  const kycSection = document.getElementById('kyc');
  const createOfferSection = document.getElementById('createOfferSection');
  const cartSection = document.getElementById('cart');
  const chatSection = document.getElementById('chat');
  const cartCount = document.getElementById('cartCount');
  const logoutBtn = document.getElementById('logout');
  const adminLink = document.getElementById('adminLink');

  if (window.location.pathname.includes('register.html')) {
    if (!currentUser) {
      document.getElementById('hello').textContent = 'Hola, Identifícate';
      document.getElementById('cartBtn').style.display = 'none';
      logoutBtn.style.display = 'none';
      adminLink.style.display = 'none';
    } else {
      window.location.href = 'index.html';
    }
  } else {
    if (!kycSection || !createOfferSection || !cartSection || !chatSection || !cartCount || !logoutBtn) {
      console.error('Uno o más elementos no se encontraron:', {
        kycSection, createOfferSection, cartSection, chatSection, cartCount, logoutBtn
      });
      return;
    }

    kycSection.style.display = 'none';
    createOfferSection.style.display = 'none';
    cartSection.style.display = 'none';
    chatSection.style.display = 'none';
    cartCount.style.display = 'none';

    if (!currentUser) {
      document.getElementById('hello').textContent = 'Hola, Identifícate';
      window.location.href = 'register.html';
    } else {
      document.getElementById('hello').textContent = `Hola, ${currentUser.email}`;
      logoutBtn.style.display = 'block';
      cartCount.style.display = 'block';
      const isAdminResult = await isAdmin();
      if (isAdminResult) {
        adminLink.style.display = 'block';
      }

      supabase.from('users').select('kyc_verified').eq('id', currentUser.id).single().then(({ data, error }) => {
        if (error) console.error('Error al verificar KYC:', error.message);
        if (!data || !data.kyc_verified) {
          kycSection.style.display = 'block';
        } else {
          createOfferSection.style.display = 'block';
        }
      }).catch(err => console.error('Error en consulta KYC:', err.message));
    }
    updateCartCount();
    loadOffers();
  }
}

async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) console.error('Error al cerrar sesión:', error.message);
  currentUser = null;
  window.location.href = 'register.html';
}

document.getElementById('logout').onclick = logout;

async function uploadKYC() {
  const file = document.getElementById('kycFile').files[0];
  if (!file) return alert('Por favor, selecciona un archivo.');
  const { error } = await supabase.storage.from('kyc-docs').upload(`${currentUser.id}/${file.name}`, file);
  if (error) {
    console.error('Error al subir KYC:', error.message);
    alert('Error al subir el documento: ' + error.message);
  } else {
    await supabase.from('users').update({ kyc_verified: true }).eq('id', currentUser.id);
    updateUI();
  }
}

async function loadOffers() {
  const offersDiv = document.getElementById('offers');
  if (!offersDiv) return;

  const { data, error } = await supabase.from('offers').select('*, users(username, reputation)');
  if (error) {
    console.error('Error al cargar ofertas:', error.message);
    alert('Error al cargar ofertas: ' + error.message);
    return;
  }
  offersDiv.innerHTML = '';
  data.forEach(offer => {
    let imageUrl = '';
    switch (offer.crypto_type) {
      case 'BTC':
        imageUrl = 'https://uxutligzjolfnmajuvcc.supabase.co/storage/v1/object/public/offer-images/bitcoin.png';
        break;
      case 'ETH':
        imageUrl = 'https://uxutligzjolfnmajuvcc.supabase.co/storage/v1/object/public/offer-images/ethereum.png';
        break;
      case 'USDT':
        imageUrl = 'https://uxutligzjolfnmajuvcc.supabase.co/storage/v1/object/public/offer-images/tether.png';
        break;
      default:
        imageUrl = 'https://uxutligzjolfnmajuvcc.supabase.co/storage/v1/object/public/offer-images/default.png';
    }

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <img src="${imageUrl}" alt="${offer.crypto_type}">
      <h3>${offer.title}</h3>
      <p>Cantidad: ${offer.quantity}</p>
      <p>Precio: $${offer.price}/unidad</p>
      <p>Método de Pago: ${offer.payment_method}</p>
      <p>Vendedor: ${offer.users.username} <span class="stars">${'★'.repeat(Math.round(offer.users.reputation))}</span></p>
      ${currentUser ? `
        <button onclick="addToCart('${offer.id}')">Añadir al Carrito</button>
        <button onclick="startChat('${offer.id}')">Contactar</button>
      ` : ''}
    `;
    offersDiv.appendChild(card);
  });
}

async function createOffer() {
  const title = document.getElementById('offerTitle').value;
  const cryptoType = document.getElementById('cryptoType').value;
  const quantity = document.getElementById('quantity').value;
  const price = document.getElementById('price').value;
  const paymentMethod = document.getElementById('paymentMethod').value;
  const { error } = await supabase.from('offers').insert({
    user_id: currentUser.id,
    title: `${quantity} ${cryptoType} por $${price * quantity}`,
    crypto_type: cryptoType,
    quantity: parseFloat(quantity),
    price: parseFloat(price),
    payment_method: paymentMethod,
  });
  if (error) {
    console.error('Error al crear oferta:', error.message);
    alert('Error al crear oferta: ' + error.message);
  } else {
    loadOffers();
    document.getElementById('offerTitle').value = '';
    document.getElementById('quantity').value = '';
    document.getElementById('price').value = '';
    document.getElementById('paymentMethod').value = '';
  }
}

async function addToCart(offerId) {
  if (!currentUser) return alert('Debes estar logueado');
  const { data, error } = await supabase.from('offers').select('quantity').eq('id', offerId).single();
  if (error) {
    console.error('Error al añadir al carrito:', error.message);
    alert('Error al añadir al carrito: ' + error.message);
    return;
  }
  cart.push({ offerId, quantity: 1 });
  await supabase.from('cart').insert({ user_id: currentUser.id, offer_id: offerId, quantity: 1 });
  updateCartCount();
  toggleCart();
}

function toggleCart() {
  const cartDiv = document.getElementById('cart');
  cartDiv.style.display = cartDiv.style.display === 'block' ? 'none' : 'block';
  loadCart();
}

async function loadCart() {
  const cartItems = document.getElementById('cartItems');
  if (!cartItems) return;

  if (!currentUser) return;
  const { data, error } = await supabase.from('cart').select('*, offers(*)').eq('user_id', currentUser.id);
  if (error) {
    console.error('Error al cargar carrito:', error.message);
    alert('Error al cargar carrito: ' + error.message);
    return;
  }
  cartItems.innerHTML = '';
  if (data.length === 0) {
    cartItems.innerHTML = '<p>Tu carrito está vacío.</p>';
  } else {
    data.forEach(item => {
      cartItems.innerHTML += `
        <div>
          <span>${item.offers.title} (x${item.quantity})</span>
          <button onclick="removeFromCart('${item.id}')">Eliminar</button>
        </div>
      `;
    });
  }
}

async function removeFromCart(cartId) {
  const { error } = await supabase.from('cart').delete().eq('id', cartId);
  if (error) {
    console.error('Error al eliminar del carrito:', error.message);
    alert('Error al eliminar del carrito: ' + error.message);
    return;
  }
  cart = cart.filter(c => c.id !== cartId);
  loadCart();
  updateCartCount();
}

function updateCartCount() {
  const cartCount = document.getElementById('cartCount');
  if (currentUser) {
    cartCount.style.display = 'block';
    cartCount.textContent = cart.length;
  } else {
    cartCount.style.display = 'none';
  }
}

function clearCart() {
  supabase.from('cart').delete().eq('user_id', currentUser.id).then(() => {
    cart = [];
    loadCart();
    updateCartCount();
  }).catch(err => {
    console.error('Error al vaciar carrito:', err.message);
    alert('Error al vaciar carrito: ' + err.message);
  });
}

async function startChat(offerId) {
  currentChatRoom = `${currentUser.id}-${offerId}`;
  document.getElementById('chat').style.display = 'block';
  const messagesDiv = document.getElementById('messages');
  messagesDiv.innerHTML = '';

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('room', currentChatRoom)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('Error al cargar mensajes:', error.message);
    return;
  }
  data.forEach(msg => {
    messagesDiv.innerHTML += `<p>${msg.message}</p>`;
  });
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

async function sendMessage() {
  const message = document.getElementById('chatInput').value;
  if (!message || !currentChatRoom) return;

  const { error } = await supabase
    .from('messages')
    .insert({
      room: currentChatRoom,
      sender_id: currentUser.id,
      message: message
    });
  if (error) {
    console.error('Error al enviar mensaje:', error.message);
    alert('Error al enviar mensaje: ' + error.message);
  }
  document.getElementById('chatInput').value = '';
}

async function isAdmin() {
  const { data, error } = await supabase.from('users').select('is_admin').eq('id', currentUser.id).single();
  if (error) console.error('Error al verificar admin:', error.message);
  return data?.is_admin || false;
}

const supabase = Supabase.createClient('https://uxutligzjolfnmajuvcc.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4dXRsaWd6am9sZm5tYWp1dmNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE5NjEyNTAsImV4cCI6MjA1NzUzNzI1MH0.pMtPmaMRAS11kgeSdP_GW3FaNX4m9Vr5_qL12lfsUQ8');

let currentUser = null;
let currentChatRoom = null;
let cart = [];