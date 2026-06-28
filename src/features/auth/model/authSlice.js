import { createSlice } from "@reduxjs/toolkit";
import { getToken, getUser } from "@/shared/api/authStorage";

const initialState = {
  token: getToken(),
  user: getUser(),
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    sessionStarted(state, action) {
      state.token = action.payload.token;
      state.user = action.payload.user;
    },
    sessionEnded(state) {
      state.token = null;
      state.user = null;
    },
  },
});

export const { sessionEnded, sessionStarted } = authSlice.actions;
export const authReducer = authSlice.reducer;
