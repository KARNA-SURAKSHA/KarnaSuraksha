import { ShieldCheck, HeartPulse, Users } from "lucide-react";
import { FaGithub, FaLinkedin, FaTwitter } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import emblem from "../assets/landing/emblem.png";

import "./AgentShell.css";

const FOOTER_PILLARS = [
  { key: "safe", Icon: ShieldCheck, text: "Safe Communities" },
  { key: "health", Icon: HeartPulse, text: "Better Health" },
  { key: "together", Icon: Users, text: "Stronger Together" },
];

export default function AgentFooter() {
  return (
    <footer className="agent-footer">
      <div className="agent-footer-inner">
        <div className="agent-footer-brand">
          <img src={emblem} alt="Karna Suraksha" />
          <div>
            <strong>Karna Suraksha</strong>
            <small>Disease Surveillance Platform</small>
          </div>
        </div>

        <ul className="agent-footer-pillars">
          {FOOTER_PILLARS.map(({ key, Icon, text }) => (
            <li key={key}>
              <Icon size={18} />
              <span>{text}</span>
            </li>
          ))}
        </ul>

        <p className="agent-footer-copy">
          © {new Date().getFullYear()} Karna Suraksha. All rights reserved.
        </p>

        <div className="agent-footer-social">
          <h3>Connect With Us</h3>
          <div>
            <a href="#" aria-label="Twitter" onClick={(event) => event.preventDefault()}>
              <FaTwitter className="agent-ico-desktop" />
              <FaXTwitter className="agent-ico-phone" />
            </a>
            <a href="#" aria-label="LinkedIn" onClick={(event) => event.preventDefault()}>
              <FaLinkedin />
            </a>
            <a href="#" aria-label="GitHub" onClick={(event) => event.preventDefault()}>
              <FaGithub />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
