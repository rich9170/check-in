import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export async function fetchTherapists(refresh = false) {
  const res = await axios.get(`${API}/therapists`, {
    params: refresh ? { refresh: true } : {},
  });
  return res.data; // { therapists, source, cached_at } | 503 -> handled by caller
}

export async function postCheckin(slug) {
  const res = await axios.post(`${API}/checkin`, { slug });
  return res.data; // { status, therapist_name, checked_in_at, test_mode }
}
