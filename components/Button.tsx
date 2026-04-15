import React from "react";

interface ButtonProps {
  onClick: (event: any) => void;
  children: React.ReactNode;
  className?: string; // Add className prop for custom sizing
  disabled?: boolean;
}

const Button: React.FC<ButtonProps> = ({ onClick, children, className = "", disabled = false }) => {
  return (
    <button
      className={`btn ${disabled ? "opacity-60 pointer-events-none" : ""} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="relative z-10 flex items-center justify-center gap-2">{children}</span>
    </button>
  );
};

export const OutlinedButton = ({ children, onClick, className = "", disabled = false }: ButtonProps) => {
  return (
    <button
      className={`btn-outline ${disabled ? "opacity-60 pointer-events-none" : ""} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="relative z-10 flex items-center justify-center gap-2">{children}</span>
    </button>
  );
};

export default Button;
