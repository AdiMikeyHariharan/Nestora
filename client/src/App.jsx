import { Routes, Route, Link, NavLink, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useApp } from "./store.jsx";
import { NESTORA, waLink } from "./api.js";
import ChatWidget from "./components/ChatWidget.jsx";
import { WaIcon, MailIcon, PhoneIcon } from "./components/icons.jsx";
import Home from "./pages/Home.jsx";
import Listings from "./pages/Listings.jsx";
import Property from "./pages/Property.jsx";
import Post from "./pages/Post.jsx";
import Login from "./pages/Login.jsx";
import Account from "./pages/Account.jsx";

export function Logo({ dark }) {
  return (
    <Link to="/" className="group flex items-center gap-2.5">
      <img
        src="/logo.png" alt="Nestora Properties"
        className={`h-10 w-10 shrink-0 object-contain transition-transform group-hover:scale-105 ${dark ? "rounded-lg bg-white p-0.5" : ""}`}
      />
      <span className={`text-xl font-extrabold tracking-tight ${dark ? "text-white" : "text-slate-900"}`}>
        Nestora
        <span className={`ml-0.5 hidden text-[10px] font-bold tracking-[0.18em] sm:inline ${dark ? "text-emerald-300" : "text-emerald-600"}`}> · FIND YOUR NEST</span>
      </span>
    </Link>
  );
}

function Header() {
  const { user, logout, currency, setCurrency } = useApp();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const nav = ({ isActive }) =>
    `rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
      isActive ? "bg-emerald-600/10 text-emerald-700" : "text-slate-600 hover:bg-slate-900/5 hover:text-slate-900"}`;

  return (
    <header className={`sticky top-0 z-50 transition-all ${scrolled ? "bg-white/80 shadow-lg shadow-slate-900/5 backdrop-blur-xl" : "bg-white/60 backdrop-blur-md"}`}>
      <div className="mx-auto flex h-16 w-[min(1200px,94%)] items-center gap-5">
        <Logo />
        <nav className="ml-3 hidden items-center gap-1 md:flex">
          <NavLink to="/listings?type=buy" className={nav}>Buy</NavLink>
          <NavLink to="/listings?type=rent" className={nav}>Rent</NavLink>
          <NavLink to="/post" className={nav}>Post Property</NavLink>
          <a href="/#flow" className="rounded-full px-4 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-900/5 hover:text-slate-900">How it works</a>
        </nav>
        <div className="ml-auto flex items-center gap-2.5">
          <select
            value={currency}
            onChange={e => setCurrency(e.target.value)}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
            title="Currency"
          >
            {Object.keys(NESTORA.rates).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {user ? (<>
            <Link to="/account" className="rounded-xl border border-slate-200 bg-white px-4 py-1.5 text-sm font-bold text-emerald-700 hover:border-emerald-400">
              Hi, {user.name.split(" ")[0]}
            </Link>
            <button onClick={logout} className="rounded-xl bg-slate-900 px-4 py-1.5 text-sm font-bold text-white hover:bg-slate-700">
              Logout
            </button>
          </>) : (<>
            <Link to="/login" className="rounded-xl border border-slate-200 bg-white px-4 py-1.5 text-sm font-bold text-slate-700 hover:border-emerald-400 hover:text-emerald-700">
              Login
            </Link>
            <Link to="/post" className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-4 py-1.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 hover:brightness-110">
              Post Property
            </Link>
          </>)}
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-16 bg-slate-950 pb-8 pt-14 text-slate-300">
      <div className="mx-auto w-[min(1200px,94%)]">
        <div className="grid gap-8 md:grid-cols-[2fr_1fr_1fr_1fr]">
          <div>
            <Logo dark />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-400">
              Find your nest — buy, rent, resale or new projects. Search by landmark, book visits and pay online, end to end.
            </p>
          </div>
          {[
            ["Explore", [["Buy", "/listings?type=buy"], ["Rent", "/listings?type=rent"], ["New Projects", "/listings?category=new"], ["Resale", "/listings?category=resale"]]],
            ["Company", [["Post Property", "/post"], ["Client Login", "/login"], ["How it works", "/#flow"], ["Contact", `mailto:${NESTORA.email}`]]]
          ].map(([h, links]) => (
            <div key={h}>
              <h4 className="mb-3 text-sm font-bold text-white">{h}</h4>
              {links.map(([label, to]) => to.startsWith("/") && !to.includes("#") ? (
                <Link key={label} to={to} className="block py-1 text-sm text-slate-400 hover:text-white">{label}</Link>
              ) : (
                <a key={label} href={to} className="block py-1 text-sm text-slate-400 hover:text-white">{label}</a>
              ))}
            </div>
          ))}
          <div>
            <h4 className="mb-3 text-sm font-bold text-white">Reach us</h4>
            <a href={`mailto:${NESTORA.email}`} className="flex items-center gap-2.5 py-1.5 text-sm text-slate-400 hover:text-white">
              <MailIcon size={17} className="shrink-0 text-slate-500" /> {NESTORA.email}
            </a>
            <a href={waLink("Hi Nestora!")} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 py-1.5 text-sm text-slate-400 hover:text-white">
              <WaIcon size={17} className="shrink-0 text-[#25d366]" /> WhatsApp
            </a>
            <a href="tel:+919000000000" className="flex items-center gap-2.5 py-1.5 text-sm text-slate-400 hover:text-white">
              <PhoneIcon size={17} className="shrink-0 text-slate-500" /> +91 90000 00000
            </a>
          </div>
        </div>
        <div className="mt-9 flex flex-wrap justify-between gap-2 border-t border-slate-800 pt-5 text-xs text-slate-500">
          <span>© {new Date().getFullYear()} Nestora Properties. All rights reserved.</span>
          <span>Privacy · Terms · Sitemap</span>
        </div>
      </div>
    </footer>
  );
}

export default function App() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/listings" element={<Listings />} />
        <Route path="/property/:id" element={<Property />} />
        <Route path="/post" element={<Post />} />
        <Route path="/login" element={<Login />} />
        <Route path="/account" element={<Account />} />
        <Route path="*" element={<Home />} />
      </Routes>
      <Footer />
      <a
        className="fixed bottom-6 right-6 z-[60] grid h-14 w-14 place-items-center rounded-full bg-[#25d366] text-white shadow-xl shadow-black/25 transition-transform hover:scale-110"
        href={waLink("Hi Nestora! I'd like help finding a property.")}
        target="_blank" rel="noreferrer" title="WhatsApp us" aria-label="Chat on WhatsApp"
      ><WaIcon size={26} /></a>
      <ChatWidget />
    </>
  );
}
