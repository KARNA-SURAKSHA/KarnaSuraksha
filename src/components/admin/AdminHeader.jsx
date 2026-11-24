import {
  useEffect,
  useState,
} from "react";

import {
  Bell,
  CalendarDays,
  ChevronDown,
  MapPin,
  Menu,
} from "lucide-react";

import emblem from "../../assets/landing/emblem.png";

function getCurrentDate() {
  const now = new Date();

  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(now);

  const day = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
  }).format(now);

  return { date, day };
}

export default function AdminHeader({
  activePage,
  location,
  onOpenLocation,
  onToggleSidebar,
}) {
  const [currentDate, setCurrentDate] = useState(getCurrentDate());

  useEffect(() => {
    const update = () => setCurrentDate(getCurrentDate());
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="admin-header">

      {/* =================================================
          MENU (mobile: hamburger; desktop: toggle)
      ================================================= */}
      <button
        type="button"
        className="admin-header-menu"
        aria-label="Toggle navigation"
        onClick={onToggleSidebar}
      >
        <Menu size={23} strokeWidth={1.6} />
      </button>

      {/* =================================================
          LOGO BRAND (Matches Agent Portal)
      ================================================= */}
      <div className="admin-header-logo-area">
        <img
          src={emblem}
          alt="Karna Suraksha"
          className="admin-header-logo-img"
        />
        <div className="admin-header-logo-text">
          <strong>Karna Suraksha</strong>
          <span>Disease Surveillance Platform</span>
        </div>
      </div>

      {/* =================================================
          LOCATION
      ================================================= */}
      <button
        type="button"
        className="admin-header-location"
        onClick={onOpenLocation}
      >
        <MapPin size={18} strokeWidth={1.7} />
        <span>Virajpet, Kodagu</span>
        <ChevronDown size={15} strokeWidth={1.8} />
      </button>

      {/* =================================================
          DATE
      ================================================= */}
      <div className="admin-header-date">
        <CalendarDays size={19} strokeWidth={1.7} />
        <span>{currentDate.date}</span>
        <i />
        <span>{currentDate.day}</span>
      </div>

      {/* =================================================
          RIGHT CLUSTER: BELL + PROFILE (Matches Agent Portal Pattern)
      ================================================= */}
      <div className="admin-header-right">

        {/* NOTIFICATIONS */}
        <button
          type="button"
          className="admin-header-notification"
          aria-label="Notifications"
        >
          <Bell size={21} strokeWidth={1.7} />
          <span className="admin-header-notification-badge">7</span>
        </button>

        {/* PROFILE */}
        <div className="admin-header-profile-wrapper">
          <div className="admin-header-profile">
            <div className="admin-profile-avatar">MA</div>

            <div className="admin-profile-details">
              <strong>Monish Aiyappa</strong>
              <span>System Administrator</span>
            </div>
          </div>
        </div>

      </div>

    </header>
  );
}