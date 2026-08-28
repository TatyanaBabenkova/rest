'use client';

import { useEffect, useMemo, useState } from 'react';
import menuJson from '@/data/menu.json';

type Role = 'Пассажир' | 'Официант' | 'Кухня' | 'Бар' | 'Менеджер';
type Station = 'kitchen' | 'bar';
type OrderStatus = 'pending' | 'accepted' | 'preparing' | 'ready' | 'served';
type StationStatus = 'waiting' | 'preparing' | 'ready';

type MenuItem = {
  id: string;
  category: string;
  name: string;
  description: string;
  price: number;
  weight: string;
  minutes: number;
  station: Station;
  image: string;
  popular: boolean;
  modifiers: string[];
};

type OrderLine = { id: string; qty: number };

type Order = {
  id: number;
  table: number;
  items: OrderLine[];
  comment: string;
  payment: 'card' | 'cash';
  status: OrderStatus;
  kitchenStatus: StationStatus;
  barStatus: StationStatus;
  source: 'passenger' | 'waiter';
  createdAt: number;
};

type AppState = {
  cart: Record<string, number>;
  waiterCart: Record<string, number>;
  order: Order | null;
  confirmationRequired: boolean;
  calls: { waiter: boolean; bill: boolean };
  stopList: string[];
  events: { time: string; text: string }[];
};

const menu = menuJson as MenuItem[];
const roles: Role[] = ['Пассажир', 'Официант', 'Кухня', 'Бар', 'Менеджер'];
const categories = ['Популярное', 'Супы', 'Горячее', 'Закуски', 'Десерты', 'Напитки', 'Снеки'];

const initialState: AppState = {
  cart: { borscht: 1 },
  waiterCart: {},
  order: null,
  confirmationRequired: true,
  calls: { waiter: false, bill: false },
  stopList: ['mushroom-cream-soup'],
  events: [{ time: '19:10', text: 'Смена открыта. Автономный режим активен.' }],
};

const statusLabels: Record<OrderStatus, string> = {
  pending: 'Ждёт подтверждения',
  accepted: 'Заказ принят',
  preparing: 'Готовится',
  ready: 'Готов к подаче',
  served: 'Подан',
};

const now = () => new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const money = (value: number) => new Intl.NumberFormat('ru-RU').format(value) + ' ₽';

function upsertLines(existing: OrderLine[], cart: Record<string, number>) {
  const result = [...existing];
  for (const [id, qty] of Object.entries(cart)) {
    const line = result.find((item) => item.id === id);
    if (line) line.qty += qty;
    else result.push({ id, qty });
  }
  return result;
}

function cartLines(cart: Record<string, number>) {
  return Object.entries(cart).filter(([, qty]) => qty > 0).map(([id, qty]) => ({ id, qty }));
}

function totalFor(lines: OrderLine[]) {
  return lines.reduce((sum, line) => sum + (menu.find((item) => item.id === line.id)?.price ?? 0) * line.qty, 0);
}

function etaFor(lines: OrderLine[]) {
  return Math.max(0, ...lines.map((line) => menu.find((item) => item.id === line.id)?.minutes ?? 0));
}

function hasStation(lines: OrderLine[], station: Station) {
  return lines.some((line) => menu.find((item) => item.id === line.id)?.station === station);
}

export default function Home() {
  const [activeRole, setActiveRole] = useState<Role>('Пассажир');
  const [state, setState] = useState<AppState>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const [category, setCategory] = useState('Популярное');
  const [search, setSearch] = useState('');
  const [waiterSearch, setWaiterSearch] = useState('');
  const [selectedTable, setSelectedTable] = useState(4);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [payment, setPayment] = useState<'card' | 'cash'>('card');
  const [comment, setComment] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('rail-dining-demo-v1');
      if (saved) setState(JSON.parse(saved));
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem('rail-dining-demo-v1', JSON.stringify(state));
  }, [state, hydrated]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const cartItems = cartLines(state.cart);
  const waiterCartItems = cartLines(state.waiterCart);
  const visibleMenu = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ru-RU');
    return menu.filter((item) => {
      const categoryMatch = category === 'Популярное' ? item.popular : item.category === category;
      const searchMatch = !query || `${item.name} ${item.description}`.toLocaleLowerCase('ru-RU').includes(query);
      return categoryMatch && searchMatch;
    });
  }, [category, search]);

  const waiterResults = useMemo(() => {
    const query = waiterSearch.trim().toLocaleLowerCase('ru-RU');
    const pool = query ? menu : menu.filter((item) => item.popular);
    return pool.filter((item) => !query || item.name.toLocaleLowerCase('ru-RU').includes(query)).slice(0, 10);
  }, [waiterSearch]);

  const addEvent = (draft: AppState, text: string) => ({
    ...draft,
    events: [{ time: now(), text }, ...draft.events].slice(0, 12),
  });

  const showNotice = (message: string) => setNotice(message);

  const changeCart = (id: string, delta: number, target: 'cart' | 'waiterCart' = 'cart') => {
    if (state.stopList.includes(id) && delta > 0) return showNotice('Позиция временно недоступна');
    setState((prev) => {
      const next = Math.max(0, (prev[target][id] ?? 0) + delta);
      const updated = { ...prev[target], [id]: next };
      if (next === 0) delete updated[id];
      return { ...prev, [target]: updated };
    });
  };

  const submitOrder = (source: 'passenger' | 'waiter') => {
    const sourceCart = source === 'passenger' ? state.cart : state.waiterCart;
    const lines = cartLines(sourceCart);
    if (!lines.length) return;
    setState((prev) => {
      const isAddOn = !!prev.order && prev.order.status !== 'served';
      const items = upsertLines(isAddOn ? prev.order!.items : [], sourceCart);
      const needsApproval = source === 'passenger' && prev.confirmationRequired;
      const nextOrder: Order = {
        id: isAddOn ? prev.order!.id : 104,
        table: source === 'passenger' ? 4 : selectedTable,
        items,
        comment: source === 'passenger' ? comment : 'Заказ принят официантом у стола',
        payment,
        status: needsApproval ? 'pending' : 'accepted',
        kitchenStatus: 'waiting',
        barStatus: 'waiting',
        source,
        createdAt: Date.now(),
      };
      return addEvent({ ...prev, order: nextOrder, cart: source === 'passenger' ? {} : prev.cart, waiterCart: source === 'waiter' ? {} : prev.waiterCart }, `${isAddOn ? 'Дозаказ' : 'Заказ'} №104 от стола ${nextOrder.table} ${needsApproval ? 'ожидает подтверждения' : 'принят в работу'}.`);
    });
    setCheckoutOpen(false);
    setCartOpen(false);
    setComment('');
    showNotice(source === 'passenger' && state.confirmationRequired ? 'Заказ отправлен официанту' : 'Заказ принят в работу');
  };

  const approveOrder = () => {
    setState((prev) => prev.order ? addEvent({ ...prev, order: { ...prev.order, status: 'accepted' } }, `Официант подтвердил заказ №${prev.order.id}.`) : prev);
    showNotice('Заказ отправлен в кухню и бар');
  };

  const updateStation = (station: Station, nextStatus: StationStatus) => {
    setState((prev) => {
      if (!prev.order) return prev;
      const key = station === 'kitchen' ? 'kitchenStatus' : 'barStatus';
      const updated = { ...prev.order, [key]: nextStatus } as Order;
      const kitchenDone = !hasStation(updated.items, 'kitchen') || updated.kitchenStatus === 'ready';
      const barDone = !hasStation(updated.items, 'bar') || updated.barStatus === 'ready';
      updated.status = kitchenDone && barDone ? 'ready' : nextStatus === 'preparing' || updated.status === 'preparing' ? 'preparing' : updated.status;
      const label = station === 'kitchen' ? 'Кухня' : 'Бар';
      const action = nextStatus === 'preparing' ? 'начал работу' : 'завершил свою часть';
      return addEvent({ ...prev, order: updated }, `${label} ${action} по заказу №${updated.id}.`);
    });
  };

  const markServed = () => {
    setState((prev) => prev.order ? addEvent({ ...prev, order: { ...prev.order, status: 'served' } }, `Заказ №${prev.order.id} подан на стол ${prev.order.table}.`) : prev);
    showNotice('Заказ отмечен как поданный');
  };

  const requestService = (type: 'waiter' | 'bill') => {
    setState((prev) => addEvent({ ...prev, calls: { ...prev.calls, [type]: true } }, `Стол 4: ${type === 'waiter' ? 'вызов официанта' : 'запрос счёта'}.`));
    showNotice(type === 'waiter' ? 'Официант уже получил вызов' : 'Официант принесёт счёт');
  };

  const clearCall = (type: 'waiter' | 'bill') => {
    setState((prev) => addEvent({ ...prev, calls: { ...prev.calls, [type]: false } }, `Официант принял запрос стола 4.`));
  };

  const toggleStop = (id: string) => {
    setState((prev) => {
      const stopped = prev.stopList.includes(id);
      const stopList = stopped ? prev.stopList.filter((item) => item !== id) : [...prev.stopList, id];
      const item = menu.find((menuItem) => menuItem.id === id)!;
      return addEvent({ ...prev, stopList }, `${item.name}: ${stopped ? 'возвращено в меню' : 'добавлено в стоп-лист'}.`);
    });
  };

  const resetDemo = () => {
    setState(initialState);
    setActiveRole('Пассажир');
    setComment('');
    setCheckoutOpen(false);
    showNotice('Демонстрация сброшена');
  };

  return (
    <main className={`app-shell role-${activeRole.toLocaleLowerCase('ru-RU')}`}>
      <Header activeRole={activeRole} setActiveRole={setActiveRole} confirmationRequired={state.confirmationRequired} />
      {activeRole === 'Пассажир' && (
        <PassengerView
          state={state} visibleMenu={visibleMenu} category={category} setCategory={setCategory}
          search={search} setSearch={setSearch} cartItems={cartItems} changeCart={changeCart}
          openCheckout={() => setCheckoutOpen(true)} requestService={requestService} cartOpen={cartOpen}
          setCartOpen={setCartOpen}
        />
      )}
      {activeRole === 'Официант' && (
        <WaiterView
          state={state} selectedTable={selectedTable} setSelectedTable={setSelectedTable}
          waiterSearch={waiterSearch} setWaiterSearch={setWaiterSearch} waiterResults={waiterResults}
          waiterCartItems={waiterCartItems} changeCart={changeCart} submitOrder={() => submitOrder('waiter')}
          approveOrder={approveOrder} markServed={markServed} clearCall={clearCall}
        />
      )}
      {activeRole === 'Кухня' && <StationView station="kitchen" state={state} updateStation={updateStation} />}
      {activeRole === 'Бар' && <StationView station="bar" state={state} updateStation={updateStation} />}
      {activeRole === 'Менеджер' && (
        <ManagerView state={state} setState={setState} toggleStop={toggleStop} resetDemo={resetDemo} />
      )}

      {checkoutOpen && (
        <CheckoutModal
          lines={cartItems} payment={payment} setPayment={setPayment} comment={comment}
          setComment={setComment} close={() => setCheckoutOpen(false)} submit={() => submitOrder('passenger')}
          confirmationRequired={state.confirmationRequired}
        />
      )}
      {notice && <div className="toast" role="status"><span>✓</span>{notice}</div>}
    </main>
  );
}

function Header({ activeRole, setActiveRole, confirmationRequired }: { activeRole: Role; setActiveRole: (role: Role) => void; confirmationRequired: boolean }) {
  return (
    <header className="topbar">
      <div className="brand-lockup">
        <span className="brand-mark">СЭ</span>
        <span><strong>Северный экспресс</strong><small>вагон-ресторан · рейс 016А</small></span>
      </div>
      <nav className="role-switcher" aria-label="Роль в прототипе">
        {roles.map((role) => <button key={role} className={activeRole === role ? 'active' : ''} onClick={() => setActiveRole(role)}>{role}</button>)}
      </nav>
      <div className="header-statuses">
        <span className="mode-pill">{confirmationRequired ? 'Через официанта' : 'Сразу в работу'}</span>
        <span className="network-pill"><i /> Автономно</span>
      </div>
    </header>
  );
}

function PassengerView({ state, visibleMenu, category, setCategory, search, setSearch, cartItems, changeCart, openCheckout, requestService, cartOpen, setCartOpen }: {
  state: AppState; visibleMenu: MenuItem[]; category: string; setCategory: (value: string) => void;
  search: string; setSearch: (value: string) => void; cartItems: OrderLine[];
  changeCart: (id: string, delta: number, target?: 'cart' | 'waiterCart') => void;
  openCheckout: () => void; requestService: (type: 'waiter' | 'bill') => void;
  cartOpen: boolean; setCartOpen: (value: boolean) => void;
}) {
  return (
    <section className="passenger-layout">
      <div className="menu-pane">
        {state.order && <PassengerOrderBanner order={state.order} confirmationRequired={state.confirmationRequired} />}
        <div className="welcome-row">
          <div>
            <p className="eyebrow">Стол 04 · Добро пожаловать</p>
            <h1>Вкус путешествия</h1>
            <p>Знакомые блюда в современной подаче — пока за окном меняются города.</p>
          </div>
          <div className="service-actions">
            <button className={state.calls.waiter ? 'requested' : ''} onClick={() => requestService('waiter')}>{state.calls.waiter ? 'Официант вызван' : 'Позвать официанта'}</button>
            <button className={state.calls.bill ? 'requested' : ''} onClick={() => requestService('bill')}>{state.calls.bill ? 'Счёт запрошен' : 'Попросить счёт'}</button>
          </div>
        </div>

        <div className="passenger-tools">
          <div className="category-strip" aria-label="Категории меню">
            {categories.map((item) => <button className={category === item ? 'selected' : ''} onClick={() => setCategory(item)} key={item}>{item}</button>)}
          </div>
          <label className="menu-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти блюдо" /></label>
        </div>

        {category === 'Популярное' && !search && (
          <section className="editorial-card">
            <div>
              <span className="editorial-kicker">Выбор шефа</span>
              <h2>Ужин, который<br />следует за вами</h2>
              <p>Сезонное меню, собранное специально для дороги.</p>
              <button onClick={() => setCategory('Горячее')}>Открыть меню</button>
            </div>
            <div className="plate-preview" style={{ backgroundImage: "linear-gradient(90deg,rgba(68,14,23,.14),rgba(68,14,23,.42)), url('menu/pozharsky-cutlet.webp')" }}><span>24 мин</span></div>
          </section>
        )}

        <div className="section-heading">
          <div><p className="eyebrow">{search ? 'Результаты поиска' : 'Меню вагона-ресторана'}</p><h2>{search ? `По запросу «${search}»` : category}</h2></div>
          <span>{visibleMenu.length} позиций</span>
        </div>
        <div className="dish-grid">
          {visibleMenu.map((item) => {
            const stopped = state.stopList.includes(item.id);
            const qty = state.cart[item.id] ?? 0;
            return (
              <article className={`dish-card ${stopped ? 'stopped' : ''}`} key={item.id}>
                <div className="dish-photo" style={{ backgroundImage: `url('${item.image}')` }}>
                  <span>{stopped ? 'Стоп-лист' : `${item.minutes} мин`}</span>
                </div>
                <div className="dish-copy">
                  <div><h3>{item.name}</h3><p>{item.description}</p><small>{item.weight}</small></div>
                  <div className="dish-action">
                    <strong>{money(item.price)}</strong>
                    {qty > 0 ? (
                      <div className="stepper"><button onClick={() => changeCart(item.id, -1)}>−</button><span>{qty}</span><button onClick={() => changeCart(item.id, 1)}>+</button></div>
                    ) : <button disabled={stopped} onClick={() => changeCart(item.id, 1)} aria-label={`Добавить ${item.name}`}>+</button>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
      <CartPanel lines={cartItems} changeCart={changeCart} openCheckout={openCheckout} order={state.order} mobileOpen={cartOpen} closeMobile={() => setCartOpen(false)} />
      {!!cartItems.length && <button className="mobile-cart" onClick={() => setCartOpen(true)}><span>Заказ · {cartItems.reduce((sum, line) => sum + line.qty, 0)}</span><strong>{money(totalFor(cartItems))}</strong></button>}
    </section>
  );
}

function PassengerOrderBanner({ order, confirmationRequired }: { order: Order; confirmationRequired: boolean }) {
  const title = order.status === 'pending' ? 'Заказ ждёт подтверждения' : order.status === 'ready' ? 'Заказ готов к подаче' : order.status === 'served' ? 'Приятного аппетита!' : 'Ваш заказ в работе';
  const copy = order.status === 'pending'
    ? 'Официант проверит заказ и сразу передаст его в производство.'
    : order.status === 'ready' ? 'Официант уже получил уведомление и скоро подойдёт к столу.'
    : order.status === 'served' ? 'Если захотите заказать ещё, просто добавьте позиции в корзину.'
    : `Ориентировочное время подачи — ${etaFor(order.items)} минут.`;
  const progress = order.status === 'pending' ? 18 : order.status === 'accepted' ? 38 : order.status === 'preparing' ? 65 : order.status === 'ready' ? 88 : 100;
  return (
    <section className={`order-banner status-${order.status}`}>
      <div className="order-banner-icon">{order.status === 'served' ? '✓' : '№'}</div>
      <div><p className="eyebrow">Заказ №{order.id} · {statusLabels[order.status]}</p><h2>{title}</h2><p>{copy}</p><div className="progress-track"><i style={{ width: `${progress}%` }} /></div></div>
      <strong>{order.status === 'pending' && confirmationRequired ? '—' : `≈ ${etaFor(order.items)} мин`}</strong>
    </section>
  );
}

function CartPanel({ lines, changeCart, openCheckout, order, mobileOpen, closeMobile }: {
  lines: OrderLine[]; changeCart: (id: string, delta: number) => void; openCheckout: () => void;
  order: Order | null; mobileOpen: boolean; closeMobile: () => void;
}) {
  return (
    <aside className={`cart-pane ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="cart-mobile-handle" onClick={closeMobile} />
      <div className="cart-title"><div><p className="eyebrow">Ваш стол</p><h2>{order && order.status !== 'served' ? 'Дозаказ' : 'Заказ'}</h2></div><span>{lines.reduce((sum, line) => sum + line.qty, 0)}</span></div>
      <div className="cart-scroll">
        {!lines.length && <div className="empty-cart"><span>＋</span><h3>Корзина пока пуста</h3><p>Выберите блюда — здесь появятся итог и время подачи.</p></div>}
        {lines.map((line) => {
          const item = menu.find((menuItem) => menuItem.id === line.id)!;
          return (
            <div className="cart-item" key={line.id}>
              <div className="cart-thumb" style={{ backgroundImage: `url('${item.image}')` }} />
              <div><strong>{item.name}</strong><small>{line.qty} × {money(item.price)}</small></div>
              <div className="mini-stepper"><button onClick={() => changeCart(item.id, -1)}>−</button><span>{line.qty}</span><button onClick={() => changeCart(item.id, 1)}>+</button></div>
            </div>
          );
        })}
      </div>
      {!!lines.length && <>
        <div className="eta-card"><span>≈ {etaFor(lines)} мин</span><p>По самой долгой позиции заказа</p></div>
        <div className="cart-total"><span>Итого</span><strong>{money(totalFor(lines))}</strong></div>
        <button className="primary-action" onClick={openCheckout}>{order && order.status !== 'served' ? 'Отправить дозаказ' : 'Перейти к оформлению'} <span>→</span></button>
      </>}
    </aside>
  );
}

function CheckoutModal({ lines, payment, setPayment, comment, setComment, close, submit, confirmationRequired }: {
  lines: OrderLine[]; payment: 'card' | 'cash'; setPayment: (value: 'card' | 'cash') => void;
  comment: string; setComment: (value: string) => void; close: () => void; submit: () => void; confirmationRequired: boolean;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <section className="checkout-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={close}>×</button>
        <p className="eyebrow">Стол 04 · Завершение заказа</p>
        <h2>Как вам будет удобно оплатить?</h2>
        <p className="modal-copy">Оплата производится официанту после подачи заказа.</p>
        <div className="payment-grid">
          <button className={payment === 'card' ? 'selected' : ''} onClick={() => setPayment('card')}><span>▣</span><strong>Картой</strong><small>Терминал принесёт официант</small></button>
          <button className={payment === 'cash' ? 'selected' : ''} onClick={() => setPayment('cash')}><span>₽</span><strong>Наличными</strong><small>Оплата официанту</small></button>
        </div>
        <label className="comment-field"><span>Комментарий к заказу</span><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Например: без лука, соус отдельно" maxLength={160} /><small>{comment.length}/160</small></label>
        <div className="checkout-summary"><span>Итого · {lines.reduce((sum, line) => sum + line.qty, 0)} поз.</span><strong>{money(totalFor(lines))}</strong></div>
        <button className="primary-action large" onClick={submit}>{confirmationRequired ? 'Отправить официанту' : 'Отправить в работу'} <span>→</span></button>
        <p className="approval-note">{confirmationRequired ? 'После отправки официант подтвердит заказ.' : 'Заказ сразу поступит на кухню и в бар.'}</p>
      </section>
    </div>
  );
}

function WaiterView({ state, selectedTable, setSelectedTable, waiterSearch, setWaiterSearch, waiterResults, waiterCartItems, changeCart, submitOrder, approveOrder, markServed, clearCall }: {
  state: AppState; selectedTable: number; setSelectedTable: (value: number) => void;
  waiterSearch: string; setWaiterSearch: (value: string) => void; waiterResults: MenuItem[];
  waiterCartItems: OrderLine[]; changeCart: (id: string, delta: number, target?: 'cart' | 'waiterCart') => void;
  submitOrder: () => void; approveOrder: () => void; markServed: () => void; clearCall: (type: 'waiter' | 'bill') => void;
}) {
  const order = state.order;
  return (
    <section className="staff-page waiter-page">
      <div className="staff-heading">
        <div><p className="eyebrow">Смена · Марина К.</p><h1>Обслуживание вагона</h1><p>Все столы, запросы и быстрый ввод заказа на одном экране.</p></div>
        <div className="shift-card"><span>4</span><small>стола в секции</small><i>Смена активна</i></div>
      </div>

      {(state.calls.waiter || state.calls.bill || order?.status === 'pending' || order?.status === 'ready') && (
        <div className="attention-strip">
          {state.calls.waiter && <button onClick={() => clearCall('waiter')}><span>!</span><strong>Стол 4 зовёт официанта</strong><small>Нажмите, чтобы принять</small></button>}
          {state.calls.bill && <button onClick={() => clearCall('bill')}><span>₽</span><strong>Стол 4 просит счёт</strong><small>Карта / наличные</small></button>}
          {order?.status === 'pending' && <button className="accent" onClick={approveOrder}><span>✓</span><strong>Заказ №{order.id} ждёт подтверждения</strong><small>Проверить и отправить</small></button>}
          {order?.status === 'ready' && <button className="ready" onClick={markServed}><span>✓</span><strong>Заказ №{order.id} полностью готов</strong><small>Забрать и подать</small></button>}
        </div>
      )}

      <div className="waiter-workspace">
        <section className="floor-card panel-card">
          <div className="panel-title"><div><p className="eyebrow">Схема вагона</p><h2>Столики</h2></div><span>4 места</span></div>
          <div className="train-plan">
            <div className="window-line"><i /><i /><i /><i /></div>
            <div className="tables-layout">
              {[1, 2, 3, 4].map((table) => {
                const isOrder = order?.table === table && order.status !== 'served';
                const call = table === 4 && (state.calls.waiter || state.calls.bill);
                return (
                  <button key={table} className={`${selectedTable === table ? 'selected' : ''} ${isOrder ? 'occupied' : ''} ${call ? 'calling' : ''}`} onClick={() => setSelectedTable(table)}>
                    <span className="seat left" /><span className="seat right" />
                    <strong>{table}</strong><small>{call ? 'Запрос' : isOrder ? statusLabels[order!.status] : 'Свободен'}</small>
                  </button>
                );
              })}
            </div>
          </div>
          {order && (
            <div className="table-order-summary">
              <div><span className={`status-dot ${order.status}`} /><div><strong>Стол {order.table} · Заказ №{order.id}</strong><small>{statusLabels[order.status]} · {order.items.reduce((sum, line) => sum + line.qty, 0)} позиции</small></div></div>
              <div className="route-chips"><span>Кухня: {stationLabel(order.kitchenStatus)}</span><span>Бар: {stationLabel(order.barStatus)}</span></div>
            </div>
          )}
        </section>

        <section className="quick-order panel-card">
          <div className="panel-title"><div><p className="eyebrow">Быстрый заказ · Стол {selectedTable}</p><h2>Добавить позицию</h2></div></div>
          <label className="waiter-search"><span>⌕</span><input autoComplete="off" value={waiterSearch} onChange={(event) => setWaiterSearch(event.target.value)} placeholder="Начните вводить: борщ, чай, котлета…" /><kbd>Найти</kbd></label>
          <div className="quick-label"><span>{waiterSearch ? 'Результаты' : 'Популярное'}</span><small>Касание сразу добавляет позицию</small></div>
          <div className="quick-grid">
            {waiterResults.map((item) => {
              const stopped = state.stopList.includes(item.id);
              const qty = state.waiterCart[item.id] ?? 0;
              return (
                <button key={item.id} disabled={stopped} onClick={() => changeCart(item.id, 1, 'waiterCart')}>
                  <img src={item.image} alt="" /><span><strong>{item.name}</strong><small>{stopped ? 'Стоп-лист' : `${money(item.price)} · ${item.minutes} мин`}</small></span>{qty > 0 && <i>{qty}</i>}
                </button>
              );
            })}
          </div>
        </section>

        <aside className="waiter-check panel-card">
          <div className="panel-title"><div><p className="eyebrow">Черновик</p><h2>Стол {selectedTable}</h2></div><span>{waiterCartItems.reduce((sum, line) => sum + line.qty, 0)}</span></div>
          <div className="waiter-lines">
            {!waiterCartItems.length && <div className="waiter-empty"><span>＋</span><p>Найдите блюдо или выберите популярное</p></div>}
            {waiterCartItems.map((line) => {
              const item = menu.find((menuItem) => menuItem.id === line.id)!;
              return <div key={line.id}><span><strong>{item.name}</strong><small>{money(item.price * line.qty)}</small></span><div className="mini-stepper"><button onClick={() => changeCart(item.id, -1, 'waiterCart')}>−</button><b>{line.qty}</b><button onClick={() => changeCart(item.id, 1, 'waiterCart')}>+</button></div></div>;
            })}
          </div>
          {!!waiterCartItems.length && <><div className="waiter-total"><span>Итого</span><strong>{money(totalFor(waiterCartItems))}</strong></div><div className="waiter-eta">Подача ≈ {etaFor(waiterCartItems)} мин</div><button className="primary-action" onClick={submitOrder}>Отправить в работу <span>→</span></button></>}
        </aside>
      </div>
    </section>
  );
}

function stationLabel(value: StationStatus) {
  return value === 'ready' ? 'готово' : value === 'preparing' ? 'готовится' : 'ожидает';
}

function StationView({ station, state, updateStation }: { station: Station; state: AppState; updateStation: (station: Station, status: StationStatus) => void }) {
  const order = state.order;
  const title = station === 'kitchen' ? 'Кухня' : 'Бар';
  const stationItems = order?.items.filter((line) => menu.find((item) => item.id === line.id)?.station === station) ?? [];
  const stationStatus = station === 'kitchen' ? order?.kitchenStatus : order?.barStatus;
  const visible = !!order && order.status !== 'pending' && order.status !== 'served' && stationItems.length > 0;
  return (
    <section className={`kds-page ${station}`}>
      <div className="kds-top">
        <div><span className="station-monogram">{station === 'kitchen' ? 'К' : 'Б'}</span><div><p>{station === 'kitchen' ? 'Горячий и холодный цех' : 'Напитки, десерты и снеки'}</p><h1>{title}</h1></div></div>
        <div className="kds-metrics"><span><b>{visible && stationStatus !== 'ready' ? 1 : 0}</b> в работе</span><span><b>{visible && stationStatus === 'ready' ? 1 : 0}</b> готово</span><i><em /> Экран активен</i></div>
      </div>
      <div className="kds-board">
        <div className="kds-column-title"><span>Активные заказы</span><small>Сначала самые ранние</small></div>
        {!visible && <div className="kds-empty"><span>✓</span><h2>Все заказы выполнены</h2><p>{order?.status === 'pending' ? 'Новый заказ появится после подтверждения официантом.' : `На станции «${title}» пока нет активных позиций.`}</p></div>}
        {visible && (
          <article className={`ticket-card ${stationStatus}`}>
            <header><div><p>Заказ №{order!.id}</p><h2>Стол {order!.table}</h2></div><span>{stationStatus === 'ready' ? 'Готово' : stationStatus === 'preparing' ? 'В работе' : 'Новый'}</span><time>04:18</time></header>
            <div className="ticket-source">{order!.source === 'passenger' ? 'Планшет пассажира' : 'Принял официант'} · {order!.payment === 'card' ? 'Оплата картой' : 'Наличные'}</div>
            <div className="ticket-lines">
              {stationItems.map((line) => {
                const item = menu.find((menuItem) => menuItem.id === line.id)!;
                return <div key={line.id}><b>{line.qty}</b><span><strong>{item.name}</strong><small>{item.weight} · норматив {item.minutes} мин</small></span>{stationStatus === 'ready' && <i>✓</i>}</div>;
              })}
            </div>
            {order!.comment && <div className="ticket-comment"><span>Комментарий</span><p>{order!.comment}</p></div>}
            <footer>
              {stationStatus === 'waiting' && <button className="ticket-start" onClick={() => updateStation(station, 'preparing')}>Начать готовить <span>→</span></button>}
              {stationStatus === 'preparing' && <button className="ticket-ready" onClick={() => updateStation(station, 'ready')}>Всё готово <span>✓</span></button>}
              {stationStatus === 'ready' && <button className="ticket-undo" onClick={() => updateStation(station, 'preparing')}>Вернуть в работу</button>}
            </footer>
          </article>
        )}
      </div>
    </section>
  );
}

function ManagerView({ state, setState, toggleStop, resetDemo }: { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; toggleStop: (id: string) => void; resetDemo: () => void }) {
  const order = state.order;
  const active = !!order && order.status !== 'served';
  const stoppedItems = menu.filter((item) => state.stopList.includes(item.id));
  return (
    <section className="staff-page manager-page">
      <div className="manager-heading">
        <div><p className="eyebrow">Рейс 016А · Вагон-ресторан</p><h1>Пульт менеджера</h1><p>Операционная картина смены в автономном режиме.</p></div>
        <button className="reset-button" onClick={resetDemo}>↻ Сбросить демонстрацию</button>
      </div>
      <div className="manager-grid">
        <section className="mode-control panel-card">
          <div><p className="eyebrow">Режим приёма заказов</p><h2>{state.confirmationRequired ? 'Подтверждает официант' : 'Сразу в производство'}</h2><p>{state.confirmationRequired ? 'Пассажирские заказы сначала появляются у официанта.' : 'Заказы с планшетов сразу видят кухня и бар.'}</p></div>
          <button className={state.confirmationRequired ? 'on' : ''} onClick={() => setState((prev) => ({ ...prev, confirmationRequired: !prev.confirmationRequired }))}><i /><span>{state.confirmationRequired ? 'Подтверждение включено' : 'Прямая отправка'}</span></button>
        </section>
        <div className="metric-card wine"><p>Активные заказы</p><strong>{active ? 1 : 0}</strong><span>{order ? `№${order.id} · стол ${order.table}` : 'Очередь свободна'}</span></div>
        <div className="metric-card"><p>Среднее ожидание</p><strong>{order ? etaFor(order.items) : 0}<small> мин</small></strong><span>Плановый норматив</span></div>
        <div className="metric-card"><p>Стоп-лист</p><strong>{state.stopList.length}</strong><span>{stoppedItems[0]?.name ?? 'Нет ограничений'}</span></div>

        <section className="manager-orders panel-card">
          <div className="panel-title"><div><p className="eyebrow">Заказы и столики</p><h2>Текущая смена</h2></div><span>4 стола</span></div>
          <div className="manager-table-head"><span>Стол / заказ</span><span>Состав</span><span>Кухня</span><span>Бар</span><span>Статус</span><span>Сумма</span></div>
          {order ? (
            <div className="manager-order-row"><span><b>{order.table}</b><i>№{order.id}</i></span><span>{order.items.reduce((sum, line) => sum + line.qty, 0)} поз.<small>{order.source === 'passenger' ? 'планшет' : 'официант'}</small></span><span className={order.kitchenStatus}>{stationLabel(order.kitchenStatus)}</span><span className={order.barStatus}>{stationLabel(order.barStatus)}</span><span><em className={order.status}>{statusLabels[order.status]}</em></span><strong>{money(totalFor(order.items))}</strong></div>
          ) : <div className="manager-empty-row">Активных заказов пока нет. Оформите заказ во вкладке «Пассажир».</div>}
          {[1, 2, 3, 4].filter((table) => table !== order?.table).map((table) => <div className="manager-free-row" key={table}><span><b>{table}</b></span><span>Стол свободен</span><i>—</i></div>)}
        </section>

        <section className="stop-list panel-card">
          <div className="panel-title"><div><p className="eyebrow">Доступность меню</p><h2>Стоп-лист</h2></div><span>{state.stopList.length}</span></div>
          <label className="stop-search"><span>⌕</span><input placeholder="Найти позицию" /></label>
          <div className="stop-items">
            {menu.slice(0, 10).map((item) => {
              const stopped = state.stopList.includes(item.id);
              return <div key={item.id}><img src={item.image} alt="" /><span><strong>{item.name}</strong><small>{item.category} · {item.station === 'kitchen' ? 'Кухня' : 'Бар'}</small></span><button className={stopped ? 'stopped' : ''} onClick={() => toggleStop(item.id)}><i />{stopped ? 'Нет' : 'Есть'}</button></div>;
            })}
          </div>
        </section>

        <section className="activity-feed panel-card">
          <div className="panel-title"><div><p className="eyebrow">Журнал смены</p><h2>Последние события</h2></div><span>live</span></div>
          <div className="events">{state.events.map((event, index) => <div key={`${event.time}-${index}`}><time>{event.time}</time><i /><p>{event.text}</p></div>)}</div>
        </section>
      </div>
    </section>
  );
}
