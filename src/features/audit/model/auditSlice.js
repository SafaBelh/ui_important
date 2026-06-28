import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  entries: [],
};

const auditSlice = createSlice({
  name: "audit",
  initialState,
  reducers: {
    auditEntryAdded(state, action) {
      state.entries.unshift(action.payload);
      if (state.entries.length > 200) state.entries.pop();
    },
    auditEntriesLoaded(state, action) {
      state.entries = action.payload;
    },
  },
});

export const { auditEntriesLoaded, auditEntryAdded } = auditSlice.actions;
export const auditReducer = auditSlice.reducer;
