import axios from 'axios';
import { API_BASE_URL } from '../apiConfig';

export const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

export function setApiAuthToken(token: string | null | undefined) {
  if (token) {
    http.defaults.headers.common.Authorization = `Bearer ${token}`;
    return;
  }

  delete http.defaults.headers.common.Authorization;
}
