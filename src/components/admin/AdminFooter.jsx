import {
  HeartPulse,
  ShieldCheck,
  Users,
} from "lucide-react";

import {
  FaGithub,
  FaLinkedin,
  FaTwitter,
} from "react-icons/fa";

import { FaXTwitter } from "react-icons/fa6";

import emblem from "../../assets/landing/emblem.png";
import "./AdminFooter.css";

const PILLARS = [
  { key: "safe", Icon: ShieldCheck, text: "Safe Communities" },
  { key: "health", Icon: HeartPulse, text: "Better Health" },
  { key: "together", Icon: Users, text: "Stronger Together" },
];

export default function AdminFooter() {
  return (
    <footer className="admin-footer">
      <div className="admin-footer-inner">
        <div className="admin-footer-brand">
          <img src={emblem} alt="Karna Suraksha" />
          <div>
            <strong>Karna Suraksha</strong>
            <small>Disease Surveillance Platform</small>
          </div>
        </div>

        <ul className="admin-footer-pillars">
          {PILLARS.map(({ key, Icon, text }) => (
            <li key={key}>
              <Icon size={18} />
              <span>{text}</span>
            </li>
          ))}
        </ul>

        <p className="admin-footer-copy">
          © {new Date().getFullYear()} Karna Suraksha. All rights reserved.
        </p>

        <div className="admin-footer-social">
          <h3>Connect With Us</h3>
          <div>
            <a
              href="#"
              aria-label="Twitter"
              onClick={(e) => e.preventDefault()}
            >
              <FaTwitter className="admin-footer-ico-desktop" />
              <FaXTwitter className="admin-footer-ico-phone" />
            </a>
            <a
              href="#"
              aria-label="LinkedIn"
              onClick={(e) => e.preventDefault()}
            >
              <FaLinkedin />
            </a>
            <a
              href="#"
              aria-label="GitHub"
              onClick={(e) => e.preventDefault()}
            >
              <FaGithub />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
