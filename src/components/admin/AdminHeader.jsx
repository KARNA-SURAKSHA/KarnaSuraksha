import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Bell,
  CalendarDays,
  ChevronDown,
  MapPin,
  Menu,
  LogOut,
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
  onExit,
  onToggleSidebar,
}) {
  const [currentDate, setCurrentDate] = useState(getCurrentDate());
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  useEffect(() => {
    const update = () => setCurrentDate(getCurrentDate());
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, []);

  /* Close profile dropdown on click outside or Escape */
  useEffect(() => {
    const handlePointerDown = (event) => {
      if (
        profileRef.current &&
        !profileRef.current.contains(event.target)
      ) {
        setProfileOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setProfileOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
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

        {/* PROFILE BUTTON + DROPDOWN (Anchored to right: 0) */}
        <div className="admin-header-profile-wrapper" ref={profileRef}>
          <button
            type="button"
            className="admin-header-profile"
            onClick={() => setProfileOpen((prev) => !prev)}
            aria-expanded={profileOpen}
            aria-haspopup="menu"
          >
            <div className="admin-profile-avatar">MA</div>

            <div className="admin-profile-details">
              <strong>Monish Aiyappa</strong>
              <span>System Administrator</span>
            </div>

            <ChevronDown
              size={15}
              strokeWidth={1.8}
              className={`admin-header-chevron ${
                profileOpen ? "admin-header-chevron-open" : ""
              }`}
            />
          </button>

          {profileOpen && (
            <>
              <button
                type="button"
                aria-label="Close profile menu"
                className="admin-header-profile-overlay"
                onClick={() => setProfileOpen(false)}
              />

              <div
                className="admin-header-profile-dropdown admin-profile-menu"
                role="menu"
              >
                <div className="admin-profile-menu-heading">
                  <strong>Monish Aiyappa</strong>
                  <span>admin@karnasuraksha.gov.in</span>
                </div>

                <div className="admin-profile-menu-location">
                  <div className="admin-profile-assignment-item">
                    <span>Role</span>
                    <strong>System Administrator</strong>
                  </div>
                  <div className="admin-profile-assignment-item">
                    <span>Jurisdiction</span>
                    <strong>Kodagu District (State Level)</strong>
                  </div>
                </div>

                <button
                  type="button"
                  className="admin-profile-logout"
                  onClick={() => {
                    setProfileOpen(false);
                    if (typeof onExit === "function") {
                      onExit();
                    }
                  }}
                  role="menuitem"
                >
                  <LogOut size={16} strokeWidth={1.8} />
                  <span>Logout</span>
                </button>
              </div>
            </>
          )}
        </div>

      </div>

    </header>
  );
}
