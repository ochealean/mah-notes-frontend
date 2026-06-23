package com.mahnotes.app;

import android.content.Intent;
import android.widget.RemoteViewsService;

/**
 * Supplies the scrolling rows for the home-screen widget's ListView.
 * One factory per widget instance (the Intent carries its appWidgetId).
 */
public class WidgetRemoteViewsService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new WidgetRemoteViewsFactory(getApplicationContext(), intent);
    }
}
