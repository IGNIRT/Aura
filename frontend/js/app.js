const App = (() => {
  // ===== Единая модель данных =====
  // users:   { id, username, password, fullName, role }        role: 'master' | 'intern'
  // clients: { id, name, phone, address, note }
  // parts:   { id, name, sku, category, qty, cost, price, vendor }  cost=закупка, price=продажа
  // orders:  { id, clientId, acceptedBy, acceptedAt, deviceType, brand, model, serial,
  //            symptoms, diagnosis, status, laborCost, partsCost, totalPrice,
  //            paymentType, paymentNote, isPaid, completedAt, pickedUpAt }
  // orderParts: { orderId, partId, qty, unitCost, unitPrice }
  // Статусы: accepted | diagnosis | in_work | waiting_parts | ready | issued

  const initDemoData = () => {
    if (!localStorage.getItem('ms_users')) localStorage.setItem('ms_users', JSON.stringify([
      { id: 1, username: 'admin', password: 'admin', fullName: 'Иванов И. И.', role: 'master' },
      { id: 2, username: 'intern', password: 'intern', fullName: 'Петров П. П.', role: 'intern' }
    ]));
    if (!localStorage.getItem('ms_clients')) localStorage.setItem('ms_clients', JSON.stringify([
      { id: 1, name: 'Сидоров А. А.', phone: '+79001234567', address: 'ул. Ленина, 1', note: '' }
    ]));
    if (!localStorage.getItem('ms_parts')) localStorage.setItem('ms_parts', JSON.stringify([
      { id: 1, name: 'Матрица TV', sku: 'MTX-40', category: 'Модули', qty: 5, cost: 3000, price: 5000, vendor: 'Опт' },
      { id: 2, name: 'Пульт универсальный', sku: 'PU-01', category: 'Аксессуары', qty: 10, cost: 200, price: 500, vendor: 'Розница' }
    ]));
    if (!localStorage.getItem('ms_orders')) localStorage.setItem('ms_orders', JSON.stringify([
      { id: 1, clientId: 1, acceptedBy: 1, acceptedAt: '2024-06-01T10:00', deviceType: 'Телевизор', brand: 'Samsung',
        model: 'UE40', serial: 'SN123', symptoms: 'Не включается', diagnosis: 'Блок питания', status: 'in_work',
        laborCost: 2000, partsCost: 5000, totalPrice: 7000, paymentType: 'money', paymentNote: '', isPaid: false,
        completedAt: null, pickedUpAt: null }
    ]));
    if (!localStorage.getItem('ms_orderParts')) localStorage.setItem('ms_orderParts', JSON.stringify([
      { orderId: 1, partId: 1, qty: 1, unitCost: 3000, unitPrice: 5000 }
    ]));
  };
  initDemoData();

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const getData = k => { try { return JSON.parse(localStorage.getItem('ms_' + k)) || []; } catch { return []; } };
  const setData = (k, v) => localStorage.setItem('ms_' + k, JSON.stringify(v));
  const byId = (arr, id) => arr.find(x => String(x.id) === String(id));
  const nextId = arr => arr.length ? Math.max(...arr.map(x => +x.id)) + 1 : 1;
  const fmtDate = s => s ? new Date(s).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
  const money = n => (n || 0).toLocaleString('ru-RU');

  const isLoggedIn = () => localStorage.getItem('ms_session') === '1';
  const login = (username, password) => {
    const u = getData('users').find(x => x.username === username && x.password === password);
    if (u) { localStorage.setItem('ms_session','1'); localStorage.setItem('ms_user_id', String(u.id)); localStorage.setItem('ms_user_role', u.role); return true; }
    return false;
  };
  const logout = () => { ['ms_session','ms_user_id','ms_user_role'].forEach(k=>localStorage.removeItem(k)); location.href='login.html'; };
  const requireAuth = () => { if (!isLoggedIn()) location.href = 'login.html'; };
  const getCurrentUser = () => byId(getData('users'), localStorage.getItem('ms_user_id'));
  const isMaster = () => localStorage.getItem('ms_user_role') === 'master';

  const statusBadge = s => {
    const m = { accepted:['info','Принят'], diagnosis:['warning','Диагностика'], in_work:['primary','В работе'],
      waiting_parts:['secondary','Ждёт запчасти'], ready:['success','Готов к выдаче'], issued:['dark','Выдан'] };
    const [c,t] = m[s] || ['secondary', s]; return `<span class="badge bg-${c}">${t}</span>`;
  };
  const paymentBadge = t => {
    const m = { money:['success','Наличные'], debt:['danger','Долг'] };
    const [c,t2] = m[t] || ['secondary', t]; return `<span class="badge bg-${c}">${t2}</span>`;
  };

  // ===== Работа с запчастями заказа =====
  const partsForOrder = orderId => getData('orderParts').filter(op => String(op.orderId) === String(orderId));
  const calcOrderParts = orderId => partsForOrder(orderId).reduce((a, op) => {
    a.price += (op.unitPrice||0)*op.qty; a.cost += (op.unitCost||0)*op.qty; return a;
  }, { price:0, cost:0 });

  // Сохранение заказа + пересчёт списания запчастей (возврат старых, списание новых)
  const saveOrder = (order, partsList) => {
    const orders = getData('orders'), parts = getData('parts');
    let ops = getData('orderParts');
    // вернуть старые остатки
    ops.filter(op => String(op.orderId) === String(order.id)).forEach(op => {
      const p = byId(parts, op.partId); if (p) p.qty += op.qty;
    });
    ops = ops.filter(op => String(op.orderId) !== String(order.id));
    // списать новые
    partsList.forEach(pl => {
      const p = byId(parts, pl.partId);
      if (!p) return;
      if (pl.qty > p.qty) throw new Error(`Недостаточно «${p.name}»: на складе ${p.qty}, запрошено ${pl.qty}`);
      p.qty -= pl.qty;
      ops.push({ orderId: order.id, partId: p.id, qty: pl.qty, unitCost: p.cost, unitPrice: p.price });
    });
    order.partsCost = partsList.reduce((s,pl)=>{ const p=byId(parts,pl.partId); return s+(p?p.price*pl.qty:0); },0);
    order.totalPrice = (order.laborCost||0) + order.partsCost;
    if (order.id) { const i = orders.findIndex(o=>String(o.id)===String(order.id)); if (i>=0) orders[i]=order; else orders.push(order); }
    else { order.id = nextId(orders); orders.push(order); }
    setData('orders', orders); setData('parts', parts); setData('orderParts', ops);
    return order.id;
  };

  const renderNav = active => {
    const u = getCurrentUser();
    const items = [
      ['orders.html','Заказы','📋','orders'], ['order-create.html','Новый','➕','create'],
      ['clients.html','Клиенты','👥','clients'], ['parts.html','Склад запчастей','📦','parts'],
      ['stock.html','Техника на складе','🛠','stock'], ['reports.html','Отчёты','📊','reports']
    ];
    document.getElementById('navbar').innerHTML = `
      <nav class="navbar navbar-expand-lg bg-white">
        <div class="container">
          <a class="navbar-brand fw-bold" href="orders.html"><span class="text-primary">🔧</span> Мастерская</a>
          <button class="navbar-toggler" data-bs-toggle="collapse" data-bs-target="#nav"><span class="navbar-toggler-icon"></span></button>
          <div class="collapse navbar-collapse" id="nav">
            <ul class="navbar-nav me-auto">
              ${items.map(([h,t,i,k])=>`<li class="nav-item"><a class="nav-link ${active===k?'active':''}" href="${h}">${i} ${t}</a></li>`).join('')}
            </ul>
            <div class="d-flex align-items-center gap-3">
              <span class="text-muted small">👤 ${u?esc(u.fullName):''} <small>(${u?.role||''})</small></span>
              <button class="btn btn-sm btn-outline-secondary" onclick="App.logout()">Выйти</button>
            </div>
          </div>
        </div>
      </nav>`;
  };

  // ===== Заготовка под бэкенд (cpp-auth-backend) =====
  // Сейчас всё в localStorage = офлайн-режим. Для синхронизации раскомментируй и подгони URL под свой C++-сервер.
  const API_BASE = ''; // например 'http://localhost:8080/api'
  const syncToBackend = async () => {
    if (!API_BASE) return; // офлайн-режим — ничего не делаем
    try {
      await fetch(`${API_BASE}/orders`, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(getData('orders')) });
    } catch (e) { console.warn('Синхронизация недоступна (работаем офлайн):', e); }
  };

  return { esc, getData, setData, byId, nextId, fmtDate, money,
    isLoggedIn, login, logout, requireAuth, getCurrentUser, isMaster,
    statusBadge, paymentBadge, partsForOrder, calcOrderParts, saveOrder,
    renderNav, syncToBackend };
})();