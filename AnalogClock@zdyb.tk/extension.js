/*
 * Copyright 2012 Aleksander Zdyb
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
 
const Main = imports.ui.main;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Panel = imports.ui.panel;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Cairo = imports.cairo;
const Gio = imports.gi.Gio;


const ERROR_LABEL = "---";
const UPDATE_INTERVAL = 500;
const FACE_WIDTH = 2;
const ARM_WIDTH = 1.75;
const MARGIN = 1;
const MOVE_RIGHT = true;


// in org.gnome.desktop.interface
const CLOCK_FORMAT_KEY        = 'clock-format';
// in org.gnome.shell.clock
const CLOCK_SHOW_SECONDS_KEY  = 'show-seconds';


function AnalogClock() {
    this._init();
}

AnalogClock.prototype = {

    _update_handler: null,
    _repaint_handler: null,
    _desktop_settings_handler: null,
    _clock_settings_handler: null,
    
    _init: function() {
        this.display_time = [-1, -1];
        this.time_format = "%R:%S"; // Safe fallback
        
        this.date_menu = Main.panel._dateMenu;
        this.orig_clock = this.date_menu._clock;
        this.analog_clock = new St.DrawingArea();
        this.time_label = new St.Label({ style_class: "datemenu-date-label", text: ERROR_LABEL});
        
        this.analog_clock.set_width(Panel.PANEL_ICON_SIZE - 2 * MARGIN);
        this.analog_clock.set_height(Panel.PANEL_ICON_SIZE - 2 * MARGIN);
        
        
        this.desktop_settings = new Gio.Settings({ schema: "org.gnome.desktop.interface" });
        this.clock_settings = new Gio.Settings({ schema: "org.gnome.shell.clock" });
        this.update_format();
    },
    
    _connect_settings: function() {
        this._desktop_settings_handler = this.desktop_settings.connect("changed", Lang.bind(this, this.update_format));
        this._clock_settings_handler = this.clock_settings.connect("changed", Lang.bind(this, this.update_format));
    },

    _disconnect_settings: function() {
        if (this._desktop_settings_handler) this.desktop_settings.disconnect(this._desktop_settings_handler);
        this._desktop_settings_handler = null;
        if (this._clock_settings_handler) this.clock_settings.disconnect(this._clock_settings_handler);
        this._clock_settings_handler = null;
    },
    
    update_format: function() {
        let clock_format = this.desktop_settings.get_string(CLOCK_FORMAT_KEY);
        let show_seconds = this.clock_settings.get_boolean(CLOCK_SHOW_SECONDS_KEY);
        
        if (clock_format == "24h") this.time_format = "%R";
        else this.time_format = "%l:%M";
        
        if (show_seconds) this.time_format += ":%S";
        
        if (clock_format != "24h") this.time_format += " %p";
    },
    
    on_timeout: function() {
        let now = new Date();
        this.time_label.set_text(now.toLocaleFormat(this.time_format))
        let display_time = [now.getHours(), now.getMinutes()];
        
        if ((this.display_time[0] != display_time[0]) || (this.display_time[1] != display_time[1])) {
            this.display_time = display_time;
            this.analog_clock.queue_repaint();
        }
        
        return true;
    },
    
    paint_clock: function (area) {
        let cr = area.get_context();
        let theme_node = this.analog_clock.get_theme_node();

        let h = this.display_time[0]; if (h > 12) h -= 12;
        let m = this.display_time[1];
        
        let area_width = area.get_width();
        let area_height = area.get_height();
        
        Clutter.cairo_set_source_color(cr, theme_node.get_foreground_color());
        cr.translate(area_width / 2.0, area_height / 2.0);

        // Draw face
        cr.setLineWidth(FACE_WIDTH);
        cr.arc(0, 0, area_height / 2.25 - FACE_WIDTH, 0, 2 * Math.PI);
        cr.stroke();

        cr.save();
        cr.setLineWidth(ARM_WIDTH);

        // Draw hours arm
        cr.save();
        cr.rotate((( h + (m / 60.0)) / 12.0) * 2 * Math.PI);
        cr.moveTo(0, 0);
        cr.lineTo(0, -0.195 * area_height);
        cr.stroke();
        cr.restore();
        
        // Draw minutes arm
        cr.save();
        cr.rotate((m / 60.0) * 2 * Math.PI);
        cr.moveTo(0, 0);
        cr.lineTo(0, -0.25 * area_height);
        cr.stroke();
        cr.restore();
        
        cr.restore();
    },
    
    enable: function() {
        if (MOVE_RIGHT) {
            Main.panel._centerBox.remove_actor(this.date_menu.actor);
            Main.panel._rightBox.insert_child_at_index(this.date_menu.actor, Main.panel._rightBox.get_children().length - 1);
        }
        
        this.date_menu.actor.remove_actor(this.orig_clock);
        this.date_menu.actor.add_actor(this.analog_clock);
        this.date_menu.actor.add_style_class_name("analog-clock");
        
        this.analog_clock.queue_repaint();
        
        let children = this.date_menu.menu.box.get_children();
        for each(let c in children) {
            if(c.name == "calendarArea") {
                c.get_children()[0].insert_child_at_index(this.time_label, 0);
                break;
            }
        }
        
        this.run = true;
        this._connect_settings();
        this._repaint_handler = this.analog_clock.connect("repaint", Lang.bind(this, this.paint_clock));
        this.on_timeout();
        this._update_handler = Mainloop.timeout_add(UPDATE_INTERVAL, Lang.bind(this, this.on_timeout));
    },
    
    disable: function() {
        this.run = false;
        this._disconnect_settings();
        if (this._repaint_handler) this.analog_clock.disconnect(this._repaint_handler);
        if (this._update_handler) Mainloop.source_remove(this._update_handler);
        
        this.date_menu.actor.remove_style_class_name("analog-clock");
        this.date_menu.actor.remove_actor(this.analog_clock);
        this.date_menu.actor.add_actor(this.orig_clock);
        
        let children = this.date_menu.menu.box.get_children();
        for each(let c in children) {
            if(c.name == "calendarArea") {
                c.get_children()[0].remove_actor(this.time_label);
                break;
            }
        }
        
        if (MOVE_RIGHT) {
            Main.panel._rightBox.remove_actor(this.date_menu.actor);
            Main.panel._centerBox.add(this.date_menu.actor, 0);
        }
    }
}

function init() {
    return new AnalogClock();
}
