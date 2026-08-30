/* eslint-disable @next/next/no-img-element -- локальные WebP уже оптимизированы для автономного каталога */
'use client';

import { useEffect, useMemo, useState } from 'react';
import menuJson from '@/data/menu.json';

type Role = 'Пассажир' | 'Официант' | 'Кухня' | 'Бар' | 'Менеджер';
type Station = 'kitchen' | 'bar';
type TrainTheme = 'aurora' | 'burevestnik';
type Payment = 'card' | 'cash';
type OrderStatus = 'pending' | 'accepted' | 'preparing' | 'ready' | 'served' | 'rejected';
type StationStatus = 'waiting' | 'preparing' | 'ready';
type ServiceType = 'waiter' | 'bill';
type VisitStatus = 'open' | 'bill' | 'closed';

type MenuItem = {
  id: string; category: string; name: string; description: string; price: number;
  weight: string; minutes: number; station: Station; image: string; popular: boolean; modifiers: string[];
};
type OrderLine = { id: string; qty: number };
type Order = {
  id: number; table: number; seat: number; items: OrderLine[]; comment: string; payment: Payment;
  status: OrderStatus; kitchenStatus: StationStatus; barStatus: StationStatus;
  source: 'passenger' | 'waiter'; createdAt: number; promisedAt: number; visitId: number; parentId?: number;
};
type Visit = {
  id: number; table: number; payment: Payment; status: VisitStatus; createdAt: number;
  kitchenReceipt: string; barReceipt: string; closedAt?: number;
};
type ServiceCall = { id: number; table: number; type: ServiceType; status: 'new' | 'accepted'; createdAt: number };
type EventItem = { time: string; text: string };
type AppState = {
  theme: TrainTheme; confirmationRequired: boolean; cart: Record<string, number>;
  waiterCart: Record<string, number>; orders: Order[]; nextOrderId: number;
  visits: Visit[]; nextVisitId: number;
  calls: ServiceCall[]; nextCallId: number; stopList: string[]; events: EventItem[];
};

const menu = menuJson as MenuItem[];
const roles: { id: Role; icon: string; hint: string }[] = [
  { id: 'Пассажир', icon: '◉', hint: 'стол 4' }, { id: 'Официант', icon: '◇', hint: 'зал' },
  { id: 'Кухня', icon: '⌁', hint: 'еда' }, { id: 'Бар', icon: '◌', hint: 'напитки' },
  { id: 'Менеджер', icon: '▦', hint: 'смена' },
];
const categories = ['Популярное', 'Супы', 'Горячее', 'Закуски', 'Десерты', 'Напитки', 'Снеки'];
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const orderLabels: Record<OrderStatus, string> = {
  pending: 'Ждёт официанта', accepted: 'Принят', preparing: 'Готовится', ready: 'Готов к подаче', served: 'Подан', rejected: 'Отменён',
};
const stationLabels: Record<StationStatus, string> = { waiting: 'В очереди', preparing: 'Готовится', ready: 'Готово' };

const money = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
const stamp = (date = new Date()) => date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const itemFor = (id: string) => menu.find((item) => item.id === id);
const linesFrom = (cart: Record<string, number>) => Object.entries(cart).filter(([, qty]) => qty > 0).map(([id, qty]) => ({ id, qty }));
const totalFor = (lines: OrderLine[]) => lines.reduce((sum, line) => sum + (itemFor(line.id)?.price ?? 0) * line.qty, 0);
const stationTotalFor = (orders: Order[], station: Station) => orders.reduce((sum, order) => sum + order.items.filter((line) => itemFor(line.id)?.station === station).reduce((lineSum, line) => lineSum + (itemFor(line.id)?.price ?? 0) * line.qty, 0), 0);
const etaFor = (lines: OrderLine[]) => Math.max(1, ...lines.map((line) => itemFor(line.id)?.minutes ?? 0));
const hasStation = (lines: OrderLine[], station: Station) => lines.some((line) => itemFor(line.id)?.station === station);
const stationFor = (order: Order, station: Station) => station === 'kitchen' ? order.kitchenStatus : order.barStatus;

function resolvedStatus(order: Order): OrderStatus {
  if (['pending', 'served', 'rejected'].includes(order.status)) return order.status;
  const needed = ([
    hasStation(order.items, 'kitchen') ? order.kitchenStatus : null,
    hasStation(order.items, 'bar') ? order.barStatus : null,
  ].filter(Boolean) as StationStatus[]);
  if (needed.length && needed.every((status) => status === 'ready')) return 'ready';
  if (needed.some((status) => status === 'preparing' || status === 'ready')) return 'preparing';
  return 'accepted';
}

function makeInitialState(): AppState {
  const now = Date.now();
  return {
    theme: 'aurora', confirmationRequired: true, cart: {}, waiterCart: {},
    visits: [
      { id: 1, table: 2, payment: 'card', status: 'open', createdAt: now - 8 * 60_000, kitchenReceipt: '', barReceipt: '' },
      { id: 2, table: 1, payment: 'cash', status: 'open', createdAt: now - 2 * 60_000, kitchenReceipt: '', barReceipt: '' },
    ],
    orders: [
      { id: 124, table: 2, seat: 1, visitId: 1, source: 'waiter', payment: 'card', comment: 'Морс без льда', items: [{ id: 'borscht', qty: 1 }, { id: 'berry-mors', qty: 1 }], status: 'preparing', kitchenStatus: 'preparing', barStatus: 'ready', createdAt: now - 8 * 60_000, promisedAt: now + 10 * 60_000 },
      { id: 125, table: 1, seat: 3, visitId: 2, source: 'passenger', payment: 'cash', comment: '', items: [{ id: 'thyme-tea', qty: 1 }, { id: 'roasted-nuts', qty: 1 }], status: 'pending', kitchenStatus: 'waiting', barStatus: 'waiting', createdAt: now - 2 * 60_000, promisedAt: now + 5 * 60_000 },
    ],
    nextOrderId: 126, nextVisitId: 3,
    calls: [{ id: 1, table: 3, type: 'bill', status: 'new', createdAt: now - 60_000 }], nextCallId: 2,
    stopList: ['mushroom-cream-soup'],
    events: [{ time: stamp(), text: 'Смена открыта. Автономный режим активен.' }, { time: stamp(new Date(now - 8 * 60_000)), text: 'Заказ №124 принят официантом.' }],
  };
}

function remaining(deadline: number, current: number) {
  const seconds = Math.ceil((deadline - current) / 1000);
  if (seconds <= 0) return { text: `просрочено ${Math.ceil(Math.abs(seconds) / 60)} мин`, late: true };
  return { text: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`, late: false };
}

function MiniStatus({ status }: { status: OrderStatus }) {
  return <span className={`status status-${status}`}>{orderLabels[status]}</span>;
}

function Stepper({ value, onChange, compact = false }: { value: number; onChange: (value: number) => void; compact?: boolean }) {
  return <div className={`stepper ${compact ? 'stepper-compact' : ''}`}><button onClick={() => onChange(Math.max(0, value - 1))} aria-label="Уменьшить">−</button><strong>{value}</strong><button onClick={() => onChange(value + 1)} aria-label="Увеличить">+</button></div>;
}

function EmptyState({ icon, title, text }: { icon: string; title: string; text: string }) {
  return <div className="empty-state"><span>{icon}</span><h3>{title}</h3><p>{text}</p></div>;
}

export default function Home() {
  const [activeRole, setActiveRole] = useState<Role>('Пассажир');
  const [state, setState] = useState<AppState>(() => {
    if (typeof window === 'undefined') return makeInitialState();
    try {
      const saved = localStorage.getItem('rail-dining-demo-v3');
      return saved ? JSON.parse(saved) : makeInitialState();
    } catch {
      return makeInitialState();
    }
  });
  const [hydrated, setHydrated] = useState(false);
  const [clock, setClock] = useState(Date.now);
  const [category, setCategory] = useState('Популярное');
  const [search, setSearch] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [payment, setPayment] = useState<Payment>('card');
  const [passengerSeat, setPassengerSeat] = useState(1);
  const [comment, setComment] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedTable, setSelectedTable] = useState(4);
  const [selectedSeat, setSelectedSeat] = useState(1);
  const [waiterComment, setWaiterComment] = useState('');
  const [waiterSearch, setWaiterSearch] = useState('');
  const [waiterCategory, setWaiterCategory] = useState('Популярное');
  const [waiterCartOpen, setWaiterCartOpen] = useState(false);
  const [waiterTab, setWaiterTab] = useState<'pending' | 'active' | 'ready' | 'served' | 'create'>('pending');
  const [reviewId, setReviewId] = useState<number | null>(null);
  const [reviewDraft, setReviewDraft] = useState<Record<string, number>>({});
  const [closingVisitId, setClosingVisitId] = useState<number | null>(null);
  const [kitchenReceipt, setKitchenReceipt] = useState('');
  const [barReceipt, setBarReceipt] = useState('');
  const [stationTab, setStationTab] = useState<'active' | 'completed' | 'menu'>('active');

  useEffect(() => {
    const ready = window.setTimeout(() => setHydrated(true), 0);
    return () => window.clearTimeout(ready);
  }, []);
  useEffect(() => { if (hydrated) localStorage.setItem('rail-dining-demo-v3', JSON.stringify(state)); }, [state, hydrated]);
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 2600); return () => window.clearTimeout(timer); }, [notice]);

  const themeName = state.theme === 'aurora' ? 'Аврора' : 'Буревестник';
  const trainRoute = state.theme === 'aurora' ? 'Поезд №742А · Москва · Санкт-Петербург' : 'Поезд №702М · Москва · Нижний Новгород';
  const cartCount = Object.values(state.cart).reduce((sum, qty) => sum + qty, 0);
  const waiterCartCount = Object.values(state.waiterCart).reduce((sum, qty) => sum + qty, 0);
  const passengerOrders = state.orders.filter((order) => order.table === 4).sort((a, b) => b.createdAt - a.createdAt);
  const passengerVisit = state.visits.find((visit) => visit.table === 4 && visit.status !== 'closed');
  const passengerHasOpenOrders = Boolean(passengerVisit && state.orders.some((order) => order.visitId === passengerVisit.id && order.status !== 'rejected'));
  const closingVisit = closingVisitId ? state.visits.find((visit) => visit.id === closingVisitId) : null;
  const closingOrders = closingVisit ? state.orders.filter((order) => order.visitId === closingVisit.id && order.status !== 'rejected') : [];
  const pendingCount = state.orders.filter((order) => order.status === 'pending').length;
  const readyCount = state.orders.filter((order) => order.status === 'ready').length;
  const openCalls = state.calls.filter((call) => call.status === 'new');

  const filteredMenu = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ru-RU');
    return menu.filter((item) => (category === 'Популярное' ? item.popular : item.category === category) && (!query || `${item.name} ${item.description} ${item.category}`.toLocaleLowerCase('ru-RU').includes(query)));
  }, [category, search]);
  const waiterResults = useMemo(() => {
    const query = waiterSearch.trim().toLocaleLowerCase('ru-RU');
    return menu.filter((item) => {
      const categoryMatch = waiterCategory === 'Популярное' ? item.popular : item.category === waiterCategory;
      const queryMatch = !query || `${item.name} ${item.description} ${item.category}`.toLocaleLowerCase('ru-RU').includes(query);
      return query ? queryMatch : categoryMatch;
    });
  }, [waiterCategory, waiterSearch]);

  const addEvent = (text: string) => ({ time: stamp(), text });
  const changeCart = (id: string, qty: number, waiter = false) => setState((current) => ({ ...current, [waiter ? 'waiterCart' : 'cart']: { ...(waiter ? current.waiterCart : current.cart), [id]: Math.max(0, qty) } }));

  const createOrder = (source: 'passenger' | 'waiter') => {
    const cart = source === 'passenger' ? state.cart : state.waiterCart;
    const lines = linesFrom(cart).filter((line) => !state.stopList.includes(line.id));
    if (!lines.length) return;
    const table = source === 'passenger' ? 4 : selectedTable;
    const seat = source === 'passenger' ? passengerSeat : selectedSeat;
    const id = state.nextOrderId;
    const openVisit = state.visits.find((visit) => visit.table === table && visit.status !== 'closed');
    const visitId = openVisit?.id ?? state.nextVisitId;
    const rootOrder = openVisit ? state.orders.filter((order) => order.visitId === openVisit.id).sort((a, b) => a.createdAt - b.createdAt)[0] : undefined;
    const orderPayment = openVisit?.payment ?? (source === 'passenger' ? payment : 'card');
    const isPending = source === 'passenger' && state.confirmationRequired;
    const createdAt = Date.now();
    const order: Order = { id, table, seat, visitId, parentId: rootOrder?.id, items: lines, source, payment: orderPayment, comment: source === 'passenger' ? comment.trim() : waiterComment.trim(), status: isPending ? 'pending' : 'accepted', kitchenStatus: 'waiting', barStatus: 'waiting', createdAt, promisedAt: createdAt + etaFor(lines) * 60_000 };
    const newVisit: Visit | null = openVisit ? null : { id: visitId, table, payment: orderPayment, status: 'open', createdAt, kitchenReceipt: '', barReceipt: '' };
    setState((current) => ({ ...current, visits: newVisit ? [...current.visits, newVisit] : current.visits.map((visit) => visit.id === visitId && visit.status === 'bill' ? { ...visit, status: 'open' } : visit), nextVisitId: newVisit ? visitId + 1 : current.nextVisitId, orders: [...current.orders, order], nextOrderId: id + 1, [source === 'passenger' ? 'cart' : 'waiterCart']: {}, events: [addEvent(`${rootOrder ? 'Дозаказ' : 'Заказ'} №${id} создан для стола ${table}.`), ...current.events].slice(0, 30) }));
    if (source === 'passenger') { setCheckoutOpen(false); setCartOpen(false); setComment(''); setNotice(rootOrder ? `Дозаказ №${id} отправлен официанту` : isPending ? `Заказ №${id} отправлен официанту` : `Заказ №${id} принят в работу`); }
    else { setWaiterComment(''); setWaiterCartOpen(false); setNotice(rootOrder ? `Дозаказ №${id} создан для стола ${table}` : `Заказ №${id} создан для стола ${table}`); setWaiterTab('active'); }
  };

  const openReview = (order: Order) => { setReviewId(order.id); setReviewDraft(Object.fromEntries(order.items.map((line) => [line.id, line.qty]))); };
  const approveReview = () => {
    const lines = linesFrom(reviewDraft);
    if (!reviewId || !lines.length || lines.some((line) => state.stopList.includes(line.id))) return;
    const approvedAt = Date.now();
    setState((current) => ({ ...current, orders: current.orders.map((order) => order.id === reviewId ? { ...order, items: lines, status: 'accepted', kitchenStatus: 'waiting', barStatus: 'waiting', promisedAt: approvedAt + etaFor(lines) * 60_000 } : order), events: [addEvent(`Официант подтвердил заказ №${reviewId}.`), ...current.events].slice(0, 30) }));
    setReviewId(null); setReviewDraft({}); setNotice(`Заказ №${reviewId} подтверждён`);
  };
  const rejectReview = () => {
    if (!reviewId) return;
    setState((current) => ({ ...current, orders: current.orders.map((order) => order.id === reviewId ? { ...order, status: 'rejected' } : order), events: [addEvent(`Заказ №${reviewId} отменён официантом.`), ...current.events].slice(0, 30) }));
    setReviewId(null); setReviewDraft({}); setNotice(`Заказ №${reviewId} отменён`);
  };
  const setStationStatus = (orderId: number, station: Station, value: StationStatus) => setState((current) => ({ ...current, orders: current.orders.map((order) => { if (order.id !== orderId) return order; const changed = { ...order, [station === 'kitchen' ? 'kitchenStatus' : 'barStatus']: value } as Order; return { ...changed, status: resolvedStatus(changed) }; }), events: [addEvent(`${station === 'kitchen' ? 'Кухня' : 'Бар'}: заказ №${orderId} — ${stationLabels[value].toLocaleLowerCase('ru-RU')}.`), ...current.events].slice(0, 30) }));
  const markServed = (orderId: number) => setState((current) => ({ ...current, orders: current.orders.map((order) => order.id === orderId ? { ...order, status: 'served' } : order), events: [addEvent(`Заказ №${orderId} подан гостю.`), ...current.events].slice(0, 30) }));
  const startClosingVisit = (visit: Visit) => { setClosingVisitId(visit.id); setKitchenReceipt(visit.kitchenReceipt); setBarReceipt(visit.barReceipt); };
  const confirmCloseVisit = () => {
    if (!closingVisit) return;
    const needsKitchen = closingOrders.some((order) => hasStation(order.items, 'kitchen'));
    const needsBar = closingOrders.some((order) => hasStation(order.items, 'bar'));
    if ((needsKitchen && !kitchenReceipt.trim()) || (needsBar && !barReceipt.trim())) { setNotice('Укажите номера чеков перед закрытием стола'); return; }
    const closedAt = clock;
    setState((current) => ({ ...current, visits: current.visits.map((visit) => visit.id === closingVisit.id ? { ...visit, status: 'closed', kitchenReceipt: kitchenReceipt.trim(), barReceipt: barReceipt.trim(), closedAt } : visit), calls: current.calls.map((call) => call.table === closingVisit.table ? { ...call, status: 'accepted' } : call), events: [addEvent(`Стол ${closingVisit.table} закрыт. Чеки сохранены.`), ...current.events].slice(0, 30) }));
    setClosingVisitId(null); setKitchenReceipt(''); setBarReceipt(''); setNotice(`Стол ${closingVisit.table} закрыт`);
  };
  const callService = (type: ServiceType) => {
    if (state.calls.some((call) => call.table === 4 && call.type === type && call.status === 'new')) { setNotice('Запрос уже передан официанту'); return; }
    const id = state.nextCallId;
    setState((current) => ({ ...current, visits: type === 'bill' ? current.visits.map((visit) => visit.table === 4 && visit.status === 'open' ? { ...visit, status: 'bill' } : visit) : current.visits, calls: [...current.calls, { id, table: 4, type, status: 'new', createdAt: Date.now() }], nextCallId: id + 1, events: [addEvent(`Стол 4: ${type === 'waiter' ? 'вызов официанта' : 'запрос счёта'}.`), ...current.events].slice(0, 30) }));
    setNotice(type === 'waiter' ? 'Официант уже получил вызов' : 'Запрос на счёт передан');
  };
  const acceptCall = (id: number) => setState((current) => ({ ...current, calls: current.calls.map((call) => call.id === id ? { ...call, status: 'accepted' } : call) }));
  const toggleStop = (id: string) => setState((current) => ({ ...current, stopList: current.stopList.includes(id) ? current.stopList.filter((item) => item !== id) : [...current.stopList, id] }));
  const reviewOrder = reviewId ? state.orders.find((order) => order.id === reviewId) : null;

  if (!hydrated) return <div className="boot"><div className="boot-mark">А</div><p>Готовим вагон-ресторан…</p></div>;

  const renderDishCard = ({ item, waiter = false }: { item: MenuItem; waiter?: boolean }) => {
    const cart = waiter ? state.waiterCart : state.cart;
    const qty = cart[item.id] ?? 0;
    const stopped = state.stopList.includes(item.id);
    return <article className={`dish-card ${stopped ? 'dish-stopped' : ''} ${waiter ? 'dish-card-compact' : ''}`}><div className="dish-image-wrap"><img src={`${basePath}/${item.image}`} alt={item.name} className="dish-image" />{item.popular && <span className="dish-badge">Выбор гостей</span>}{stopped && <span className="stop-badge">Временно нет</span>}</div><div className="dish-body"><div className="dish-meta"><span>{item.category}</span><span>≈ {item.minutes} мин</span></div><h3>{item.name}</h3>{!waiter && <p>{item.description}</p>}<div className="dish-footer"><div><strong>{money(item.price)}</strong><small>{item.weight}</small></div>{qty > 0 ? <Stepper value={qty} compact onChange={(value) => changeCart(item.id, value, waiter)} /> : <button className="add-button" disabled={stopped} onClick={() => changeCart(item.id, 1, waiter)} aria-label={`Добавить ${item.name}`}>+</button>}</div></div></article>;
  };

  const renderWaiterMenuItem = (item: MenuItem) => {
    const qty = state.waiterCart[item.id] ?? 0;
    const stopped = state.stopList.includes(item.id);
    return <article className={`waiter-menu-item ${stopped ? 'dish-stopped' : ''}`} key={item.id}>
      <div className="waiter-menu-thumb"><img src={`${basePath}/${item.image}`} alt="" />{stopped && <span>Нет</span>}</div>
      <div className="waiter-menu-copy"><span>{item.category} · {item.minutes} мин</span><strong>{item.name}</strong><small>{item.weight} · {money(item.price)}</small></div>
      {qty > 0 ? <Stepper value={qty} compact onChange={(value) => changeCart(item.id, value, true)} /> : <button className="waiter-add" disabled={stopped} onClick={() => changeCart(item.id, 1, true)} aria-label={`Добавить ${item.name}`}>+</button>}
    </article>;
  };

  const renderCart = ({ waiter = false }: { waiter?: boolean }) => {
    const cart = waiter ? state.waiterCart : state.cart;
    const lines = linesFrom(cart);
    const table = waiter ? selectedTable : 4;
    const openVisit = state.visits.find((visit) => visit.table === table && visit.status !== 'closed');
    const isAddon = Boolean(openVisit && state.orders.some((order) => order.visitId === openVisit.id));
    const cartComment = waiter ? waiterComment : comment;
    return <aside className={`cart-panel ${waiter ? 'waiter-cart' : ''}`}>
      <div className="panel-heading"><div><span className="eyebrow">{waiter ? `Стол ${selectedTable} · место ${selectedSeat}` : 'Стол 4'}</span><h2>{isAddon ? 'Дозаказ' : 'Ваш заказ'}</h2></div>{!waiter && <button className="icon-button close-mobile" onClick={() => setCartOpen(false)}>×</button>}</div>
      {!lines.length ? <EmptyState icon="＋" title="Корзина пуста" text="Добавьте блюда из меню — они появятся здесь." /> : <>
        <div className="cart-lines">{lines.map((line) => { const item = itemFor(line.id)!; return <div className="cart-line" key={line.id}><div><strong>{item.name}</strong><small>{money(item.price)} · {item.minutes} мин</small></div><Stepper value={line.qty} compact onChange={(value) => changeCart(line.id, value, waiter)} /></div>; })}</div>
        <label className="cart-comment"><span>Комментарий к заказу</span><textarea value={cartComment} onChange={(event) => waiter ? setWaiterComment(event.target.value) : setComment(event.target.value)} placeholder="Например: без лука, напиток без льда" maxLength={160} /></label>
        <div className="cart-summary"><div><span>Позиций</span><strong>{lines.reduce((sum, line) => sum + line.qty, 0)}</strong></div><div><span>Ожидаемое время</span><strong>до {etaFor(lines)} мин</strong></div><div className="cart-total"><span>Итого</span><strong>{money(totalFor(lines))}</strong></div></div>
        <button className="primary-button full" onClick={() => waiter ? createOrder('waiter') : setCheckoutOpen(true)}>{waiter ? (isAddon ? 'Принять дозаказ' : 'Принять заказ') : (isAddon ? 'Оформить дозаказ' : 'Оформить заказ')}</button>
      </>}
    </aside>;
  };

  const renderOrderCard = ({ order, station }: { order: Order; station?: Station }) => {
    const visibleLines = station ? order.items.filter((line) => itemFor(line.id)?.station === station) : order.items;
    const countdown = remaining(order.promisedAt, clock);
    const visit = state.visits.find((item) => item.id === order.visitId);
    return <article className={`order-card ${countdown.late ? 'order-late' : ''}`}>
      <div className="order-card-head"><div><span className="order-number">№ {order.id}</span><h3>Стол {order.table} · место {order.seat}</h3>{order.parentId && <span className="addon-label">Дозаказ к №{order.parentId}</span>}</div>{station ? <span className={`status station-${stationFor(order, station)}`}>{stationLabels[stationFor(order, station)]}</span> : <MiniStatus status={order.status} />}</div>
      <div className="ticket-time"><span>{stamp(new Date(order.createdAt))}</span><strong className={countdown.late ? 'late' : ''}>{order.status === 'served' ? 'подан' : countdown.text}</strong></div>
      <div className="ticket-lines">{visibleLines.map((line) => <div key={line.id}><strong>{line.qty}×</strong><span>{itemFor(line.id)?.name}</span></div>)}</div>
      {order.comment && <div className="order-comment">Комментарий: “{order.comment}”</div>}
      {!station && <div className="split-progress">{hasStation(order.items, 'kitchen') && <span><i className={`dot ${order.kitchenStatus}`} /> Кухня: {stationLabels[order.kitchenStatus]}</span>}{hasStation(order.items, 'bar') && <span><i className={`dot ${order.barStatus}`} /> Бар: {stationLabels[order.barStatus]}</span>}</div>}
      {!station && visit?.status === 'closed' && <div className="receipt-summary">{visit.kitchenReceipt && <span>Чек кухни: <strong>{visit.kitchenReceipt}</strong></span>}{visit.barReceipt && <span>Чек бара: <strong>{visit.barReceipt}</strong></span>}</div>}
      {station && stationFor(order, station) === 'waiting' && <button className="secondary-button full" onClick={() => setStationStatus(order.id, station, 'preparing')}>Начать готовить</button>}
      {station && stationFor(order, station) === 'preparing' && <button className="primary-button full" onClick={() => setStationStatus(order.id, station, 'ready')}>Готово к выдаче</button>}
      {!station && order.status === 'ready' && <button className="primary-button full" onClick={() => markServed(order.id)}>Отметить «Подан»</button>}
    </article>;
  };

  const renderPassengerView = () => {
    const visitOrders = passengerVisit ? state.orders.filter((order) => order.visitId === passengerVisit.id && order.status !== 'rejected') : [];
    const visitTotal = visitOrders.reduce((sum, order) => sum + totalFor(order.items), 0);
    const startAddon = () => { document.getElementById('passenger-menu')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setNotice('Добавьте позиции — они уйдут отдельным дозаказом'); };
    return <div className="passenger-view">
      <section className="passenger-hero"><div><span className="eyebrow">Вагон-ресторан · стол 4</span><h1>Добро пожаловать</h1><p>{trainRoute}. Выберите блюда — мы приготовим их, пока за окном меняются города.</p></div><div className="service-actions"><button onClick={() => callService('waiter')}>◇ Позвать официанта</button><button onClick={() => callService('bill')}>▤ Попросить счёт</button></div></section>
      {passengerVisit && visitOrders.length > 0 && <section className="passenger-visit-summary"><div><span>Обслуживание стола 4</span><strong>{visitOrders.length} заказ{visitOrders.length > 1 ? 'а' : ''} · {money(visitTotal)}</strong><small>{passengerVisit.status === 'bill' ? 'Счёт уже запрошен' : 'Можно добавить ещё позиции'}</small></div><button onClick={startAddon}>＋ Дозаказать</button></section>}
      {passengerOrders.length > 0 && <section className="passenger-orders">{passengerOrders.slice(0, 3).map((order) => { const countdown = remaining(order.promisedAt, clock); return <div className="passenger-order" key={order.id}><div><span>{order.parentId ? `Дозаказ №${order.id} к №${order.parentId}` : `Заказ №${order.id}`}</span><strong>{orderLabels[order.status]}</strong><small>{order.status === 'pending' ? 'Официант проверит состав перед отправкой' : order.status === 'ready' ? 'Официант скоро принесёт заказ' : order.status === 'served' ? 'Приятного аппетита!' : `Ожидаемое время: ${countdown.text}`}</small></div><div className={`progress-ring status-${order.status}`}><b>{order.status === 'ready' ? '✓' : order.status === 'pending' ? '…' : order.status === 'served' ? '✓' : Math.max(0, Math.ceil((order.promisedAt - clock) / 60_000))}</b><small>{['ready', 'served'].includes(order.status) ? '' : 'мин'}</small></div></div>; })}</section>}
      <section className="menu-toolbar" id="passenger-menu"><div className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти блюдо или напиток" /></div><div className="category-scroll">{categories.map((name) => <button key={name} className={category === name ? 'active' : ''} onClick={() => setCategory(name)}>{name}</button>)}</div></section>
      <div className="catalog-layout"><section className="catalog-section"><div className="section-title"><div><span className="eyebrow">Меню поезда «{themeName}»</span><h2>{search ? 'Результаты поиска' : category}</h2></div><span>{filteredMenu.length} позиций</span></div><div className="dish-grid">{filteredMenu.map((item) => <div className="dish-host" key={item.id}>{renderDishCard({ item })}</div>)}</div></section>{renderCart({})}</div>
      {cartCount > 0 && <button className="mobile-cart-button" onClick={() => setCartOpen(true)}><span>{passengerVisit ? 'Дозаказ' : 'Корзина'} · {cartCount}</span><strong>{money(totalFor(linesFrom(state.cart)))}</strong></button>}
      {cartOpen && <div className="mobile-cart-layer" onClick={() => setCartOpen(false)}><div onClick={(event) => event.stopPropagation()}>{renderCart({})}</div></div>}
    </div>;
  };

  const renderWaiterView = () => {
    const groups = { pending: state.orders.filter((order) => order.status === 'pending'), active: state.orders.filter((order) => ['accepted', 'preparing'].includes(order.status)), ready: state.orders.filter((order) => order.status === 'ready'), served: state.orders.filter((order) => ['served', 'rejected'].includes(order.status)).sort((a, b) => b.createdAt - a.createdAt) };
    const displayed = waiterTab === 'create' ? [] : groups[waiterTab];
    const selectedVisit = state.visits.find((visit) => visit.table === selectedTable && visit.status !== 'closed');
    const selectedVisitOrders = selectedVisit ? state.orders.filter((order) => order.visitId === selectedVisit.id && order.status !== 'rejected') : [];
    const selectedVisitTotal = selectedVisitOrders.reduce((sum, order) => sum + totalFor(order.items), 0);
    const selectedVisitSettled = selectedVisitOrders.length > 0 && selectedVisitOrders.every((order) => order.status === 'served');
    const selectedRootOrder = selectedVisitOrders.sort((a, b) => a.createdAt - b.createdAt)[0];
    const waiterTabs: { id: typeof waiterTab; label: string; count?: number }[] = [
      { id: 'create', label: selectedVisitOrders.length ? 'Дозаказ' : 'Новый заказ' },
      { id: 'pending', label: 'Подтвердить', count: groups.pending.length },
      { id: 'active', label: 'В работе', count: groups.active.length },
      { id: 'ready', label: 'К подаче', count: groups.ready.length },
      { id: 'served', label: 'Завершённые', count: groups.served.length },
    ];
    return <div className="staff-view waiter-view"><section className="staff-hero"><div><span className="eyebrow">Смена · зал вагона-ресторана</span><h1>Официант</h1><p>{pendingCount} на подтверждение · {readyCount} готовы · {openCalls.length} запросов гостей</p></div><div className="hero-clock"><strong>{stamp(new Date(clock))}</strong><span>автономный режим</span></div></section>
      {openCalls.length > 0 && <div className="call-strip">{openCalls.map((call) => <div key={call.id}><span>{call.type === 'bill' ? '▤' : '◇'}</span><strong>Стол {call.table}: {call.type === 'bill' ? 'просят счёт' : 'зовут официанта'}</strong><button onClick={() => acceptCall(call.id)}>Принять</button></div>)}</div>}
      <section className="table-map">
        <div className="section-title"><div><span className="eyebrow">Схема зала</span><h2>Выберите стол и место</h2></div></div>
        <div className="tables-row">{[1, 2, 3, 4].map((table) => { const visit = state.visits.find((item) => item.table === table && item.status !== 'closed'); const visitOrders = visit ? state.orders.filter((order) => order.visitId === visit.id && order.status !== 'rejected') : []; const calls = openCalls.filter((call) => call.table === table); const needsClosing = visitOrders.length > 0 && visitOrders.every((order) => order.status === 'served'); const attention = visitOrders.some((order) => ['pending', 'ready'].includes(order.status)) || calls.length > 0 || needsClosing; const count = visitOrders.length + calls.length; return <button key={table} className={`${selectedTable === table ? 'selected' : ''} ${attention ? 'needs-attention' : ''}`} onClick={() => setSelectedTable(table)} aria-label={`Стол ${table}: ${count ? `${count} событий` : 'свободен'}`}><span>Стол</span><strong>{table}</strong><small>{calls.length ? 'нужен подход' : needsClosing ? 'закрыть стол' : visitOrders.length ? `${visitOrders.length} заказ${visitOrders.length > 1 ? 'а' : ''}` : 'свободен'}</small>{count > 0 && <b className="table-count-badge">{count}</b>}</button>; })}</div>
        <div className="seat-selection"><div><span className="eyebrow">Стол {selectedTable}</span><strong>Выберите место</strong><small>Нажатие сразу откроет новый заказ или дозаказ</small></div><div className="seat-diagram"><button className={`seat seat-1 ${selectedSeat === 1 ? 'selected' : ''}`} onClick={() => { setSelectedSeat(1); setWaiterTab('create'); }}>1</button><button className={`seat seat-2 ${selectedSeat === 2 ? 'selected' : ''}`} onClick={() => { setSelectedSeat(2); setWaiterTab('create'); }}>2</button><div className="seat-table-shape">Стол {selectedTable}</div><button className={`seat seat-3 ${selectedSeat === 3 ? 'selected' : ''}`} onClick={() => { setSelectedSeat(3); setWaiterTab('create'); }}>3</button><button className={`seat seat-4 ${selectedSeat === 4 ? 'selected' : ''}`} onClick={() => { setSelectedSeat(4); setWaiterTab('create'); }}>4</button></div></div>
        {selectedVisit && <div className={`table-session-strip ${selectedVisitSettled ? 'ready-close' : ''}`}><div><span>{selectedVisit.status === 'bill' ? 'Счёт запрошен' : `Обслуживание стола ${selectedTable}`}</span><strong>{selectedVisitOrders.length} заказ{selectedVisitOrders.length > 1 ? 'а' : ''} · {money(selectedVisitTotal)}</strong><small>{selectedVisitSettled ? 'Все заказы поданы — можно закрывать стол' : 'Заказы продолжают готовиться или ожидают подачи'}</small></div><div><button className="secondary-button" onClick={() => setWaiterTab('create')}>＋ Дозаказ{selectedRootOrder ? ` к №${selectedRootOrder.id}` : ''}</button><button className="primary-button" disabled={!selectedVisitSettled} onClick={() => startClosingVisit(selectedVisit)}>Закрыть стол</button></div></div>}
      </section>
      <div className="work-tabs waiter-work-tabs">{waiterTabs.map(({ id, label, count }) => <button key={id} className={`${waiterTab === id ? 'active' : ''} ${id === 'create' ? 'new-order-tab' : ''}`} onClick={() => setWaiterTab(id)}>{id === 'create' && <span className="tab-plus">+</span>}<span>{label}</span>{typeof count === 'number' && <b className={count > 0 ? 'queue-count has-count' : 'queue-count'}>{count}</b>}</button>)}</div>
      {waiterTab === 'create' ? <><div className="waiter-create"><section><div className="selected-order-target"><div><span>{selectedVisitOrders.length ? 'Дозаказ' : 'Новый заказ'}</span><strong>Стол {selectedTable} · место {selectedSeat}</strong></div><small>{selectedVisitOrders.length && selectedRootOrder ? `Будет связан с заказом №${selectedRootOrder.id}` : 'Стол и место выбраны на схеме выше'}</small></div><div className="search-box waiter-search"><span>⌕</span><input autoFocus value={waiterSearch} onChange={(event) => setWaiterSearch(event.target.value)} placeholder="Быстрый поиск: борщ, чай, лосось…" /></div><div className="waiter-categories">{categories.map((name) => <button key={name} className={waiterCategory === name ? 'active' : ''} onClick={() => { setWaiterCategory(name); setWaiterSearch(''); }}>{name}</button>)}</div><div className="quick-hint">{waiterSearch ? `Найдено: ${waiterResults.length}` : `${waiterCategory} · ${waiterResults.length} позиций`}</div><div className="waiter-menu-grid">{waiterResults.map(renderWaiterMenuItem)}</div></section>{renderCart({ waiter: true })}</div>{waiterCartCount > 0 && <button className="mobile-cart-button waiter-mobile-cart-button" onClick={() => setWaiterCartOpen(true)}><span>{selectedVisitOrders.length ? 'Дозаказ' : 'Заказ'} · {waiterCartCount}</span><strong>{money(totalFor(linesFrom(state.waiterCart)))}</strong></button>}{waiterCartOpen && <div className="mobile-cart-layer" onClick={() => setWaiterCartOpen(false)}><div onClick={(event) => event.stopPropagation()}>{renderCart({ waiter: true })}</div></div>}</> : displayed.length ? <div className="orders-grid">{displayed.map((order) => <div key={order.id}>{waiterTab === 'pending' ? <article className="order-card approval-card"><div className="order-card-head"><div><span className="order-number">№ {order.id}</span><h3>Стол {order.table} · место {order.seat}</h3>{order.parentId && <span className="addon-label">Дозаказ к №{order.parentId}</span>}</div><MiniStatus status={order.status} /></div><div className="ticket-lines">{order.items.map((line) => <div key={line.id}><strong>{line.qty}×</strong><span>{itemFor(line.id)?.name}</span></div>)}</div>{order.comment && <div className="order-comment">Комментарий: “{order.comment}”</div>}<div className="card-total"><span>{order.payment === 'card' ? 'Картой' : 'Наличными'}</span><strong>{money(totalFor(order.items))}</strong></div><button className="primary-button full" onClick={() => openReview(order)}>Проверить заказ</button></article> : renderOrderCard({ order })}</div>)}</div> : <EmptyState icon="✓" title="Здесь всё спокойно" text={waiterTab === 'pending' ? 'Новых заказов на подтверждение нет.' : 'В этой очереди пока нет заказов.'} />}
    </div>;
  };

  const renderStationView = ({ station }: { station: Station }) => {
    const stationOrders = state.orders.filter((order) => !['pending', 'rejected', 'served'].includes(order.status) && hasStation(order.items, station));
    const active = stationOrders.filter((order) => stationFor(order, station) !== 'ready').sort((a, b) => a.createdAt - b.createdAt);
    const completed = stationOrders.filter((order) => stationFor(order, station) === 'ready').sort((a, b) => b.createdAt - a.createdAt);
    const stationMenu = menu.filter((item) => item.station === station);
    const stationName = station === 'kitchen' ? 'Кухня' : 'Бар';
    return <div className="staff-view station-view"><section className="staff-hero"><div><span className="eyebrow">Производственный экран</span><h1>{stationName}</h1><p>{active.length} в очереди · {completed.length} готовы к выдаче</p></div><div className="hero-clock"><strong>{stamp(new Date(clock))}</strong><span>смена открыта</span></div></section><div className="work-tabs">{([['active', `В работе · ${active.length}`], ['completed', `Готово · ${completed.length}`], ['menu', 'Стоп-лист']] as const).map(([id, label]) => <button key={id} className={stationTab === id ? 'active' : ''} onClick={() => setStationTab(id)}>{label}</button>)}</div>{stationTab === 'menu' ? <div className="stop-list-grid">{stationMenu.map((item) => <label key={item.id} className={state.stopList.includes(item.id) ? 'stopped' : ''}><div><strong>{item.name}</strong><small>{item.category} · {item.minutes} мин</small></div><input type="checkbox" checked={!state.stopList.includes(item.id)} onChange={() => toggleStop(item.id)} /><span className="switch" /></label>)}</div> : (stationTab === 'active' ? active : completed).length ? <div className="orders-grid station-grid">{(stationTab === 'active' ? active : completed).map((order) => <div className="order-host" key={order.id}>{renderOrderCard({ order, station })}</div>)}</div> : <EmptyState icon={stationTab === 'active' ? '⌁' : '✓'} title={stationTab === 'active' ? 'Очередь пуста' : 'Пока ничего не готово'} text="Новые подтверждённые заказы появятся здесь автоматически." />}</div>;
  };

  const renderManagerView = () => {
    const activeOrders = state.orders.filter((order) => !['served', 'rejected'].includes(order.status));
    const revenue = state.orders.filter((order) => order.status === 'served').reduce((sum, order) => sum + totalFor(order.items), 0);
    return <div className="staff-view manager-view"><section className="staff-hero"><div><span className="eyebrow">Управление сменой</span><h1>Менеджер</h1><p>Единый обзор зала, кухни и бара</p></div><div className="hero-clock"><strong>{stamp(new Date(clock))}</strong><span>всё работает локально</span></div></section>
      <section className="theme-control"><div className="section-title"><div><span className="eyebrow">Оформление поезда</span><h2>Выберите фирменный стиль</h2></div></div><div className="theme-cards"><button className={state.theme === 'aurora' ? 'selected aurora-card' : 'aurora-card'} onClick={() => setState((current) => ({ ...current, theme: 'aurora' }))}><span className="theme-pattern" /><div><strong>Аврора</strong><small>Белый · синий · золото</small></div><b>{state.theme === 'aurora' ? 'Выбрано' : 'Включить'}</b></button><button className={state.theme === 'burevestnik' ? 'selected burevestnik-card' : 'burevestnik-card'} onClick={() => setState((current) => ({ ...current, theme: 'burevestnik' }))}><span className="theme-pattern" /><div><strong>Буревестник</strong><small>Глубокий зелёный · латунь</small></div><b>{state.theme === 'burevestnik' ? 'Выбрано' : 'Включить'}</b></button></div></section>
      <section className="manager-grid"><div className="metric-card"><span>Активные заказы</span><strong>{activeOrders.length}</strong><small>{pendingCount} ждут подтверждения</small></div><div className="metric-card"><span>Готовы к подаче</span><strong>{readyCount}</strong><small>по всем столам</small></div><div className="metric-card"><span>Запросы гостей</span><strong>{openCalls.length}</strong><small>требуют внимания</small></div><div className="metric-card"><span>Выручка прототипа</span><strong>{money(revenue)}</strong><small>по поданным заказам</small></div></section>
      <div className="manager-columns"><section className="settings-panel"><div className="panel-heading"><div><span className="eyebrow">Режим ресторана</span><h2>Подтверждение заказов</h2></div></div><label className="setting-toggle"><div><strong>Проверка официантом</strong><small>{state.confirmationRequired ? 'Заказ пассажира сначала приходит официанту' : 'Заказ сразу уходит в кухню и бар'}</small></div><input type="checkbox" checked={state.confirmationRequired} onChange={() => setState((current) => ({ ...current, confirmationRequired: !current.confirmationRequired }))} /><span className="switch" /></label><div className="manager-actions"><button className="secondary-button" onClick={() => { localStorage.removeItem('rail-dining-demo-v3'); setState(makeInitialState()); setNotice('Демонстрация возвращена к началу'); }}>Сбросить демонстрацию</button></div></section><section className="events-panel"><div className="panel-heading"><div><span className="eyebrow">Журнал</span><h2>Последние события</h2></div></div><div className="event-list">{state.events.slice(0, 7).map((event, index) => <div key={`${event.time}-${index}`}><time>{event.time}</time><span>{event.text}</span></div>)}</div></section></div>
      <section className="manager-orders"><div className="section-title"><div><span className="eyebrow">Все подразделения</span><h2>Заказы смены</h2></div><span>{state.orders.length} всего</span></div><div className="manager-table"><div className="manager-table-head"><span>Заказ</span><span>Стол</span><span>Состав</span><span>Кухня</span><span>Бар</span><span>Статус</span><span>Сумма</span></div>{[...state.orders].sort((a,b) => b.createdAt-a.createdAt).map((order) => <div className="manager-table-row" key={order.id}><strong>№{order.id}</strong><span>{order.table} / {order.seat}</span><span>{order.items.reduce((sum,line) => sum+line.qty,0)} поз.</span><span>{hasStation(order.items,'kitchen') ? stationLabels[order.kitchenStatus] : '—'}</span><span>{hasStation(order.items,'bar') ? stationLabels[order.barStatus] : '—'}</span><MiniStatus status={order.status} /><strong>{money(totalFor(order.items))}</strong></div>)}</div></section>
    </div>;
  };

  return <main className="app-shell" data-train={state.theme}><div className="brand-ornament" /><header className="app-header"><div className="brand"><div className="brand-mark"><i /><i /></div><div><strong>{themeName.toLocaleUpperCase('ru-RU')}</strong><span>{trainRoute}</span></div></div><nav className="role-nav" aria-label="Роли прототипа">{roles.map((role) => <button key={role.id} className={activeRole === role.id ? 'active' : ''} onClick={() => setActiveRole(role.id)}><span>{role.icon}</span><strong>{role.id}</strong><small>{role.hint}</small>{role.id === 'Официант' && pendingCount + readyCount + openCalls.length > 0 && <b>{pendingCount + readyCount + openCalls.length}</b>}</button>)}</nav><div className="offline-badge"><i />На борту · офлайн</div></header><div className="prototype-note"><span>Интерактивный прототип</span><p>Все роли работают в одной вкладке. Данные сохраняются только в этом браузере.</p></div>
    {activeRole === 'Пассажир' && renderPassengerView()}{activeRole === 'Официант' && renderWaiterView()}{activeRole === 'Кухня' && renderStationView({ station: 'kitchen' })}{activeRole === 'Бар' && renderStationView({ station: 'bar' })}{activeRole === 'Менеджер' && renderManagerView()}
    {checkoutOpen && <div className="modal-layer" onClick={() => setCheckoutOpen(false)}><section className="checkout-modal" onClick={(event) => event.stopPropagation()}><div className="panel-heading"><div><span className="eyebrow">Стол 4</span><h2>{passengerHasOpenOrders ? 'Оформление дозаказа' : 'Оформление заказа'}</h2></div><button className="icon-button" onClick={() => setCheckoutOpen(false)}>×</button></div><div className="checkout-summary"><span>{cartCount} позиций · до {etaFor(linesFrom(state.cart))} мин</span><strong>{money(totalFor(linesFrom(state.cart)))}</strong></div><div className="field-group"><label>Ваше место за столом</label><div className="choice-row seats">{[1,2,3,4].map((seat) => <button key={seat} className={passengerSeat === seat ? 'active' : ''} onClick={() => setPassengerSeat(seat)}>{seat}</button>)}</div></div>{passengerHasOpenOrders && passengerVisit ? <div className="inherited-payment"><span>Способ оплаты сохранён для стола</span><strong>{passengerVisit.payment === 'card' ? '▣ Картой' : '▤ Наличными'}</strong></div> : <div className="field-group"><label>Способ оплаты</label><div className="choice-row"><button className={payment === 'card' ? 'active' : ''} onClick={() => setPayment('card')}>▣ Картой</button><button className={payment === 'cash' ? 'active' : ''} onClick={() => setPayment('cash')}>▤ Наличными</button></div></div>}<label className="field-group"><span>Комментарий к заказу</span><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Например: без лука, приборы на двоих" maxLength={160} /></label><div className="confirmation-note"><span>◇</span><p>{passengerHasOpenOrders ? 'Новые позиции уйдут отдельным дозаказом и не изменят уже готовящиеся блюда.' : state.confirmationRequired ? 'После отправки официант проверит заказ и подтвердит его.' : 'Заказ сразу поступит на кухню и в бар.'}</p></div><button className="primary-button full large" onClick={() => createOrder('passenger')}>Отправить {passengerHasOpenOrders ? 'дозаказ' : 'заказ'} · {money(totalFor(linesFrom(state.cart)))}</button></section></div>}
    {reviewOrder && <div className="modal-layer" onClick={() => setReviewId(null)}><section className="review-modal" onClick={(event) => event.stopPropagation()}><div className="panel-heading"><div><span className="eyebrow">{reviewOrder.parentId ? `Дозаказ к №${reviewOrder.parentId}` : 'Заказ пассажира'}</span><h2>№{reviewOrder.id} · стол {reviewOrder.table}</h2></div><button className="icon-button" onClick={() => setReviewId(null)}>×</button></div><div className="review-meta"><span>Место {reviewOrder.seat}</span><span>{reviewOrder.payment === 'card' ? 'Оплата картой' : 'Оплата наличными'}</span><span>{stamp(new Date(reviewOrder.createdAt))}</span></div>{reviewOrder.comment && <div className="order-comment">Комментарий: “{reviewOrder.comment}”</div>}<div className="review-lines">{reviewOrder.items.map((line) => { const item = itemFor(line.id)!; const stopped = state.stopList.includes(line.id); return <div key={line.id} className={stopped ? 'review-stopped' : ''}><img src={`${basePath}/${item.image}`} alt="" /><div><strong>{item.name}</strong><small>{money(item.price)} · {item.station === 'kitchen' ? 'Кухня' : 'Бар'}{stopped ? ' · В СТОП-ЛИСТЕ' : ''}</small></div><Stepper value={reviewDraft[line.id] ?? 0} onChange={(value) => setReviewDraft((current) => ({ ...current, [line.id]: value }))} /></div>; })}</div><div className="review-total"><span>После подтверждения: до {etaFor(linesFrom(reviewDraft))} мин</span><strong>{money(totalFor(linesFrom(reviewDraft)))}</strong></div>{linesFrom(reviewDraft).some((line) => state.stopList.includes(line.id)) && <div className="warning-note">Удалите позицию из стоп-листа, чтобы подтвердить заказ.</div>}<div className="modal-actions"><button className="danger-button" onClick={rejectReview}>Отклонить</button><button className="primary-button" disabled={!linesFrom(reviewDraft).length || linesFrom(reviewDraft).some((line) => state.stopList.includes(line.id))} onClick={approveReview}>Подтвердить и отправить</button></div></section></div>}
    {closingVisit && <div className="modal-layer" onClick={() => setClosingVisitId(null)}><section className="checkout-modal close-visit-modal" onClick={(event) => event.stopPropagation()}><div className="panel-heading"><div><span className="eyebrow">Завершение обслуживания</span><h2>Закрыть стол {closingVisit.table}</h2></div><button className="icon-button" onClick={() => setClosingVisitId(null)}>×</button></div><div className="close-total"><span>{closingOrders.length} заказ{closingOrders.length > 1 ? 'а' : ''} · {closingVisit.payment === 'card' ? 'оплата картой' : 'оплата наличными'}</span><strong>{money(closingOrders.reduce((sum, order) => sum + totalFor(order.items), 0))}</strong></div><div className="receipt-fields">{closingOrders.some((order) => hasStation(order.items, 'kitchen')) && <label><span>Номер чека кухни</span><small>Сумма кухни: {money(stationTotalFor(closingOrders, 'kitchen'))}</small><input value={kitchenReceipt} onChange={(event) => setKitchenReceipt(event.target.value)} placeholder="Например, К-01842" maxLength={24} autoFocus /></label>}{closingOrders.some((order) => hasStation(order.items, 'bar')) && <label><span>Номер чека бара</span><small>Сумма бара: {money(stationTotalFor(closingOrders, 'bar'))}</small><input value={barReceipt} onChange={(event) => setBarReceipt(event.target.value)} placeholder="Например, Б-00917" maxLength={24} /></label>}</div><div className="confirmation-note"><span>✓</span><p>Все заказы стола поданы. После закрытия номера чеков сохранятся в завершённых заказах.</p></div><button className="primary-button full large" onClick={confirmCloseVisit}>Сохранить чеки и закрыть стол</button></section></div>}
    {notice && <div className="toast"><span>✓</span>{notice}</div>}
  </main>;
}
