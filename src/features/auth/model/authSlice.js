import { createSlice } from "@reduxjs/toolkit";
import { getSession } from "@/shared/api/authStorage";

const initialState = getSession();

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    sessionSynced(state, action) {
      state.token = action.payload?.token || null;
      state.user = action.payload?.user || null;
    },
    sessionEnded(state) {
      state.token = null;
      state.user = null;
    },
  },
});

export const { sessionEnded, sessionSynced } = authSlice.actions;
export const authReducer = authSlice.reducer;
