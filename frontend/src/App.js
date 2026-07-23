import "@/App.css";
import { Routes, Route } from "react-router-dom";
import Kiosk from "@/components/Kiosk";
import AdminOrder from "@/components/AdminOrder";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Kiosk />} />
      <Route path="/admin" element={<AdminOrder />} />
    </Routes>
  );
}

export default App;
