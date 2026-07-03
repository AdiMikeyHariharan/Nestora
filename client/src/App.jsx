import { Routes, Route, Link, NavLink, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useApp } from "./store.jsx";
import { NESTORA, waLink } from "./api.js";
import ChatWidget from "./components/ChatWidget.jsx";
import Home from "./pages/Home.jsx";
import Listings from "./pages/Listings.jsx";
import Property from "./pages/Property.jsx";
import Post from "./pages/Post.jsx";
import Login from "./pages/Login.jsx";
import Account from "./pages/Account.jsx";

function Header() {
  const { user, logout, currency, setCurrency } = useApp();
  return (
    <header className="site-header">
      <div className="container nav">
        <Link className="brand" to="/">
          <span className="logo">N</span>
          <span>Nestora<small>FIND YOUR NEST</small></span>
        </Link>
        <nav className="nav-links">
          <NavLink to="/listings?type=buy">Buy</NavLink>
          <NavLink to="/listings?type=rent">Rent</NavLink>
          <NavLink to="/post">Post Property</NavLink>
          <a href="/#flow">How it works</a>
        </nav>
        <div className="nav-right">
          <select className="currency" value={currency} onChange={e => setCurrency(e.target.value)} title="Currency">
            {Object.keys(NESTORA.rates).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {user ? (<>
            <Link className="btn btn-ghost btn-sm" to="/account">Hi, {user.name.split(" ")[0]}</Link>
            <button className="btn btn-primary btn-sm" onClick={logout}>Logout</button>
          </>) : (<>
            <Link className="btn btn-ghost btn-sm" to="/login">Login</Link>
            <Link className="btn btn-primary btn-sm" to="/post">Post Property</Link>
          </>)}
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <div className="brand" style={{ color: "#fff" }}><span className="logo">N</span><span style={{ color: "#fff" }}>Nestora</span></div>
            <p style={{ color: "#94a3b8", marginTop: 12, maxWidth: 320 }}>
              Find your nest — buy, rent, resale or new projects. Search by landmark, book visits and pay online, end to end.
            </p>
          </div>
          <div><h4>Explore</h4>
            <Link to="/listings?type=buy">Buy</Link><Link to="/listings?type=rent">Rent</Link>
            <Link to="/listings?category=new">New Projects</Link><Link to="/listings?category=resale">Resale</Link>
          </div>
          <div><h4>Company</h4>
            <Link to="/post">Post Property</Link><Link to="/login">Client Login</Link>
            <a href="/#flow">How it works</a><a href={`mailto:${NESTORA.email}`}>Contact</a>
          </div>
          <div><h4>Reach us</h4>
            <a href={`mailto:${NESTORA.email}`}>✉ {NESTORA.email}</a>
            <a href={waLink("Hi Nestora!")} target="_blank" rel="noreferrer">🟢 WhatsApp</a>
            <a href="tel:+919000000000">📞 +91 90000 00000</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Nestora. Demo build.</span>
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
      <div className="float-stack">
        <a className="fab wa" href={waLink("Hi Nestora! I'd like help finding a property.")} target="_blank" rel="noreferrer" title="WhatsApp us">🟢</a>
      </div>
      <ChatWidget />
    </>
  );
}
