package com.mahnotes.app;

import android.content.Intent;
import android.widget.RemoteViewsService;

/** Supplies the scrollable rows for the home-screen widget's ListView. */
public class WidgetRemoteViewsService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new WidgetRemoteViewsFactory(getApplicationContext(), intent);
    }
}
