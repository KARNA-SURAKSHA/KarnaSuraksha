import {
  useState,
} from "react";

import AdminSidebar
  from "../../components/admin/AdminSidebar";

import AdminHeader
  from "../../components/admin/AdminHeader";

import AdminLocationSelector
  from "../../components/admin/AdminLocationSelector";

import AdminFooter
  from "../../components/admin/AdminFooter";


export default function AdminLayout({
  nav,
  activeKey,
  activePage,
  onNavigate,
  onExit,
  location,
  onLocationChange,
  children,
}) {

  const [
    sidebarOpen,
    setSidebarOpen,
  ] =
    useState(false);

  const [
    locationOpen,
    setLocationOpen,
  ] =
    useState(false);


  return (

    <div className="admin-shell">


      <AdminSidebar
        nav={nav}
        activeKey={activeKey}
        onNavigate={onNavigate}
        onExit={onExit}
        open={sidebarOpen}
        onClose={() =>
          setSidebarOpen(false)
        }
      />


      <main className="admin-main">


        <AdminHeader
          activePage={activePage}
          location={location}
          onOpenLocation={() =>
            setLocationOpen(true)
          }
          onExit={onExit}
          onToggleSidebar={() =>
            setSidebarOpen((prev) => !prev)
          }
        />


        <AdminLocationSelector
          value={location}
          onChange={onLocationChange}
          open={locationOpen}
          onClose={() =>
            setLocationOpen(false)
          }
        />


        <div className="admin-content">

          <div className="admin-content-inner">

            {children}

          </div>

        </div>


        <AdminFooter />

      </main>

    </div>

  );

}