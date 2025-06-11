import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="layout">
      {/* You can add common layout elements here, like a Navbar or Footer */}
      <main>{children}</main>
    </div>
  );
};

export default Layout;
