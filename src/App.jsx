import PasswordGate from "./PasswordGate";
import RevenueDashboard from "./pages/RevenueDashboard";

export default function App() {
  return (
    <PasswordGate>
      <RevenueDashboard />
    </PasswordGate>
  );
}